(() => {
  const P = window.C1404_PINS;
  const K = {
    log: "c1404.log.v1",
    pool: "c1404.pool.v1",
    rpc: "c1404.rpc.v1",
    theme: "c1404.theme.v1",
    extra: "c1404.contracts.v1",
    accept: "c1404.accept.v1",
    err: "c1404.err.v1",
    active: "c1404.active.v1",
    walletId: "c1404.wallet.v1",
    wantSession: "c1404.session.v1",
    account: "c1404.account.v1",
    locked: "c1404.locked.v1",
    picked: "c1404.picked.v1",
    hist: "c1404.poolHist.v1",
    pulse: "c1404.pulse.v1"
  };
  const state = {
    account: null,
    provider: null,
    walletName: "",
    rpc: P.rpcs[0].url,
    rpcName: P.rpcs[0].name,
    ready: false,
    migrate: false,
    reason: "",
    epoch: 0,
    nextEpoch: 0,
    paused: false,
    blocked: false,
    restrictedPot: false,
    liveImpl: "",
    liveOwner: "",
    pos: { wallet: 0n, principal: 0n, yieldAmt: 0n, unbonding: 0n, first: 0n },
    unbond: [],
    minerSplit: 70,
    stakerSplit: 30,
    rpcMs: [],
    rpcBad: false,
    rpcWhy: "",
    pulse: { balance: 0n, totalStake: 0n, delta: 0n },
    split: null,
    sendLedger: "community",
    positions: [],
    posScanAt: 0
  };

  const $ = (id) => document.getElementById(id);
  const hexToBig = (h) => BigInt(h || "0x0");
  const pad32 = (hex) => String(hex || "").replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const addrWord = (a) => pad32(a);
  const uintWord = (n) => pad32(BigInt(n).toString(16));
  const nowSec = () => Math.floor(Date.now() / 1000);
  const isAddr = (a) => /^0x[a-fA-F0-9]{40}$/.test(a || "");
  const short = (a) => (a && a.length > 10 ? a.slice(0, 6) + "…" + a.slice(-4) : (a || "—"));

  function fmt(wei, digits = 4) {
    try {
      const v = typeof wei === "bigint" ? wei : hexToBig(typeof wei === "string" && wei.startsWith("0x") ? wei : "0x" + BigInt(wei).toString(16));
      const neg = v < 0n;
      const abs = neg ? -v : v;
      const whole = abs / 10n ** 18n;
      const frac = abs % 10n ** 18n;
      let f = frac.toString().padStart(18, "0").slice(0, Math.max(0, digits));
      f = f.replace(/0+$/, "");
      const head = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "-" : "") + head + (f ? "." + f : "");
    } catch { return "—"; }
  }
  function asNum(wei) {
    try {
      const v = typeof wei === "bigint" ? wei : 0n;
      const n = Number(v / 10n ** 14n) / 1e4;
      return Number.isFinite(n) ? n : 0;
    } catch { return 0; }
  }
  function parseAmount(str) {
    const s = String(str || "").trim().replace(/,/g, "");
    if (!s || !/^\d+(\.\d+)?$/.test(s)) throw new Error("Enter a valid amount.");
    const [w, f = ""] = s.split(".");
    return BigInt(w) * 10n ** 18n + BigInt((f + "000000000000000000").slice(0, 18));
  }
  function dateFromSec(s) {
    if (!s) return "—";
    return new Date(Number(s) * 1000).toLocaleString();
  }
  function sanitize(msg) {
    let t = String(msg || "");
    t = t.replace(/0x[a-fA-F0-9]{8,}/g, "[hex]");
    t = t.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}\b/g, "[redacted]");
    t = t.replace(/\b(private key|seed|mnemonic|secret|password|signature)\b[:\s]*\S+/gi, "[redacted]");
    t = t.replace(/\b(\w+\s+){11,23}\w+\b/g, "[redacted-phrase]");
    return t.slice(0, 400);
  }
  function pushErr(msg) {
    const rows = loadErr();
    rows.unshift({ t: new Date().toISOString(), m: sanitize(msg) });
    localStorage.setItem(K.err, JSON.stringify(rows.slice(0, 40)));
    renderErr();
  }
  function loadErr() {
    try { return JSON.parse(localStorage.getItem(K.err) || "[]"); } catch { return []; }
  }
  function renderErr() {
    const box = $("errBody");
    if (!box) return;
    const rows = loadErr();
    box.textContent = rows.length
      ? rows.map((r) => r.t.replace("T", " ").slice(0, 19) + "  " + r.m).join("\n")
      : "No errors yet.";
    const n = $("errCount");
    if (n) n.textContent = String(rows.length);
  }

  function theme() { return document.documentElement.getAttribute("data-theme") || "dark"; }
  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem(K.theme, mode);
    const btn = $("btnTheme");
    if (btn) btn.innerHTML = mode === "dark"
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }

  function extraContracts() {
    try { return JSON.parse(localStorage.getItem(K.extra) || "[]"); } catch { return []; }
  }
  function allContracts() {
    return P.contracts.concat(extraContracts());
  }
  function activeContract() {
    const id = localStorage.getItem(K.active);
    return allContracts().find((c) => c.id === id) || allContracts()[0];
  }
  function acceptedPins() {
    try { return JSON.parse(localStorage.getItem(K.accept) || "{}"); } catch { return {}; }
  }

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(K.log) || "[]"); } catch { return []; }
  }
  function saveLog(rows) { localStorage.setItem(K.log, JSON.stringify(rows.slice(0, 250))); }
  function addLog(row) {
    const rows = loadLog();
    rows.unshift({ t: Date.now(), ...row });
    saveLog(rows);
    renderLog();
    drawCharts();
  }
  function renderLog() {
    const box = $("logBody");
    if (!box) return;
    const rows = loadLog();
    if (!rows.length) {
      box.innerHTML = "<div class='bubble'><div class='meta'>Empty</div><div>No actions on this device yet.</div></div>";
      return;
    }
    box.innerHTML = rows.map((r) => {
      const kind = r.status === "done" ? "ok" : r.status === "failed" ? "bad" : "wait";
      const icon = r.action === "Stake" ? "fa-lock" : r.action === "Unstake" ? "fa-unlock" : r.action === "Claim" ? "fa-coins" : "fa-circle-dot";
      return `<div class="bubble ${kind}">
        <div class="d-flex justify-content-between gap-2">
          <strong><i class="fa-solid ${icon} me-2"></i>${r.action || "Action"}</strong>
          <span class="pill ${kind}">${r.status || "—"}</span>
        </div>
        <div class="mt-1">${r.amount || "—"}</div>
        <div class="meta mt-1">${new Date(r.t).toLocaleString()}${r.hash ? " · " + r.hash.slice(0, 12) + "…" : ""}</div>
        <div class="meta">${r.note || ""}</div>
      </div>`;
    }).join("");
  }

  function lockedContract() {
    try { return JSON.parse(sessionStorage.getItem(K.picked) || "null"); } catch { return null; }
  }
  function rememberPosition(addr, label) {
    if (!isAddr(addr) || isStakingProxy(addr)) return;
    const k = addr.toLowerCase();
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem(K.hist) || "[]"); } catch { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    const next = [{ address: k, label: label || short(addr), at: Date.now() }].concat(rows.filter((r) => (r.address || "").toLowerCase() !== k));
    localStorage.setItem(K.hist, JSON.stringify(next.slice(0, 40)));
  }
  function rememberedPositions() {
    try { return JSON.parse(localStorage.getItem(K.hist) || "[]"); } catch { return []; }
  }
  function lockContract(row) {
    if (!row || !isAddr(row.address)) return;
    if (isStakingProxy(row.address)) {
      alert("That address is the staking contract itself. Pick one of your staking positions listed below.");
      return;
    }
    sessionStorage.setItem(K.picked, JSON.stringify({
      address: row.address.toLowerCase(),
      label: row.label || short(row.address),
      at: Date.now()
    }));
    rememberPosition(row.address, row.label);
    paintPoolHealth(row.address);
    refresh();
  }
  function unlockContract() {
    sessionStorage.removeItem(K.picked);
    refresh();
  }
  function savedPool() { return ""; }
  function setPool(addr) { if (addr) rememberPosition(addr); }
  function currentPool() {
    const picked = lockedContract();
    if (picked && isAddr(picked.address) && !isStakingProxy(picked.address)) return picked.address;
    const el = $("pool");
    const typed = el && el.value.trim();
    if (isAddr(typed) && !isStakingProxy(typed)) return typed;
    return "";
  }


  function isStakingProxy(addr) {
    const a = (addr || "").toLowerCase();
    return allContracts().some((c) => (c.proxy || "").toLowerCase() === a);
  }
  async function probeMiner(addr) {
    const out = { ok: false, mining: null, validations: 0, isProxy: false, name: "" };
    if (!isAddr(addr)) return out;
    if (isStakingProxy(addr)) {
      return { ok: true, mining: false, validations: 0, isProxy: true, name: "staking proxy" };
    }
    const explorers = (P.explorers || []).map((e) => String(e.url || "").replace(/\/$/, "")).filter(Boolean);
    for (const base of explorers) {
      try {
        const ctrl = AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined;
        const info = await fetch(base + "/api/v2/addresses/" + addr, { headers: { Accept: "application/json" }, signal: ctrl }).then((r) => r.ok ? r.json() : null);
        if (!info) continue;
        let validations = 0;
        try {
          const c = await fetch(base + "/api/v2/addresses/" + addr + "/counters", { headers: { Accept: "application/json" }, signal: ctrl }).then((r) => r.ok ? r.json() : {});
          validations = Number(c.validations_count || 0);
        } catch {}
        const mining = !!(info.has_validated_blocks || validations > 0);
        return { ok: true, mining, validations, isProxy: false, name: info.name || "" };
      } catch {}
    }
    return out;
  }
  async function paintPoolHealth(addr) {
    const el = $("poolHealth");
    if (!el) return null;
    if (!isAddr(addr)) {
      el.className = "small mb-2 d-none";
      el.textContent = "";
      return null;
    }
    el.className = "small mb-2 text-secondary";
    el.textContent = "Checking whether this address actually mines…";
    const probe = await probeMiner(addr);
    if (probe.isProxy) {
      el.className = "small mb-2 text-warning";
      el.textContent = "This is the staking contract, not a mining pool. Rewards stay at zero if you stake here. Choose the miner 0x you already use.";
    } else if (probe.ok && probe.mining) {
      el.className = "small mb-2 text-success";
      el.textContent = "This address has produced blocks (" + probe.validations.toLocaleString() + " validated). Yield can credit against this pool.";
    } else if (probe.ok && probe.mining === false) {
      el.className = "small mb-2 text-warning";
      el.textContent = "This address has never produced a block on the community explorer. Staking here usually keeps yield at 0. Pick a live mining pool.";
    } else {
      el.className = "small mb-2 text-secondary";
      el.textContent = "Could not verify miner status from the explorer. Confirm the 0x is a live community mining pool before you stake.";
    }
    return probe;
  }
  async function warnIfBadPool(addr, action) {
    const probe = await probeMiner(addr);
    if (probe.isProxy) {
      alert("That 0x is the staking contract, not a mining pool. Choose the miner address you already stake with.");
      return false;
    }
    if (action === "Stake" && probe.ok && probe.mining === false) {
      return confirm("This address has never produced a community block. Yield on this pool will likely stay 0. Stake here anyway?");
    }
    if (action === "Stake" && !probe.ok) {
      return confirm("Could not verify that this address mines. Stake anyway?");
    }
    return true;
  }


  function denied(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      return P.fork.rejectHosts.some((h) => host === h || host.endsWith("." + h));
    } catch { return true; }
  }

  async function rpcCall(url, method, params = [], ms = 3500) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error("Connection status " + res.status);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || "RPC error");
      return { result: json.result, ms: Math.round(performance.now() - t0) };
    } finally { clearTimeout(t); }
  }
  async function rpc(method, params, ms) {
    const r = await rpcCall(state.rpc, method, params, ms);
    return r.result;
  }

  async function pickRpc() {
    const custom = ($("rpcCustom") && $("rpcCustom").value.trim()) || localStorage.getItem(K.rpc);
    const list = [];
    if (custom) list.push({ name: "Custom", url: custom });
    P.rpcs.forEach((n) => list.push(n));
    const checks = await Promise.all(list.map(async (n) => {
      if (denied(n.url)) return { n, ok: false, why: "blocked host", ms: 0 };
      try {
        const id = await rpcCall(n.url, "eth_chainId");
        if (parseInt(id.result, 16) !== P.chainId) return { n, ok: false, why: "wrong chain", ms: id.ms };
        const blk = await rpcCall(n.url, "eth_getBlockByNumber", ["0x" + P.fork.firstDivergent.toString(16), false], 4500);
        const h = (blk.result && blk.result.hash || "").toLowerCase();
        if (h && h !== P.fork.community316002) return { n, ok: false, why: "wrong chain copy", ms: blk.ms };
        return { n, ok: true, ms: id.ms };
      } catch (e) {
        return { n, ok: false, why: e.message || "timeout", ms: 0 };
      }
    }));
    state.rpcMs = checks.map((c) => ({ name: c.n.name, ok: c.ok, ms: c.ms, why: c.why }));
    const good = checks.find((c) => c.ok);
    const badBits = checks.filter((c) => !c.ok).map((c) => c.why).join(" ");
    state.rpcBad = !good || /blocked|wrong chain/.test(badBits) || denied(state.rpc);
    state.rpcWhy = good ? "" : (checks.find((c) => c.why)?.why || "No allowed community RPC");
    if (!good) throw new Error("No community connection answered.");
    state.rpc = good.n.url;
    state.rpcName = good.n.name;
    state.rpcBad = denied(state.rpc);
    localStorage.setItem(K.rpc, good.n.url);
  }

  async function safetyChecks() {
    const c = activeContract();
    const chainId = await rpc("eth_chainId");
    if (parseInt(chainId, 16) !== P.chainId) throw new Error("Wrong network.");
    const [implWord, code] = await Promise.all([
      rpc("eth_getStorageAt", [c.proxy, P.implSlot, "latest"]),
      rpc("eth_getCode", [c.proxy, "latest"])
    ]);
    if (!code || code === "0x") throw new Error("Staking contract not found on this connection.");
    state.liveImpl = "0x" + implWord.slice(-40);
    const acc = acceptedPins();
    const expectedImpl = (acc[c.id] && acc[c.id].implementation) || c.implementation;
    const expectedOwner = (acc[c.id] && acc[c.id].owner) || c.owner;
    try {
      state.liveOwner = "0x" + (await rpc("eth_call", [{ to: c.proxy, data: P.sel.owner }, "latest"])).slice(-40);
    } catch { state.liveOwner = ""; }
    const pausedRaw = await rpc("eth_call", [{ to: c.proxy, data: P.sel.paused }, "latest"]).catch(() => "0x0");
    state.paused = hexToBig(pausedRaw) !== 0n;
    const implChanged = expectedImpl && state.liveImpl.toLowerCase() !== expectedImpl.toLowerCase();
    const ownerChanged = expectedOwner && state.liveOwner && state.liveOwner.toLowerCase() !== expectedOwner.toLowerCase();
    state.migrate = !!(implChanged || ownerChanged);
    if (state.paused) {
      state.ready = false;
      state.reason = "Staking is paused on-chain.";
      return;
    }
    if (state.migrate) {
      state.ready = false;
      state.reason = "Contract changed. Review it on the Contracts page before sending.";
      return;
    }
    state.ready = true;
    state.reason = "";
  }

  async function readFlags() {
    if (!state.account) return;
    const c = activeContract();
    try {
      const blk = await rpc("eth_call", [{ to: P.blocklist.full, data: P.sel.isBlocked + addrWord(state.account) }, "latest"]);
      state.blocked = hexToBig(blk) !== 0n;
    } catch { state.blocked = false; }
    try {
      const r = await rpc("eth_call", [{ to: P.blocklist.selective, data: P.sel.isRestricted + addrWord(c.proxy) }, "latest"]);
      state.restrictedPot = hexToBig(r) !== 0n;
    } catch { state.restrictedPot = false; }
  }

  async function readEpoch() {
    const c = activeContract();
    const [ep, next, miner, staker] = await Promise.all([
      rpc("eth_call", [{ to: c.proxy, data: P.sel.currentEpoch }, "latest"]).catch(() => "0x0"),
      rpc("eth_call", [{ to: c.proxy, data: P.sel.timeToNextEpoch }, "latest"]).catch(() => "0x0"),
      rpc("eth_call", [{ to: c.proxy, data: P.sel.minerSplit }, "latest"]).catch(() => "0x46"),
      rpc("eth_call", [{ to: c.proxy, data: P.sel.stakerSplit }, "latest"]).catch(() => "0x1e")
    ]);
    state.epoch = Number(hexToBig(ep));
    state.nextEpoch = Number(hexToBig(next));
    state.minerSplit = Number(hexToBig(miner)) || 70;
    state.stakerSplit = Number(hexToBig(staker)) || 30;
  }

  async function ethCall(data) {
    return rpc("eth_call", [{ to: activeContract().proxy, data }, "latest"]);
  }

  function decodeUnbonding(hex) {
    try {
      if (!hex || hex === "0x" || hex.length < 66) return [];
      const raw = hex.slice(2);
      const offset = Number(BigInt("0x" + raw.slice(0, 64)));
      if (!Number.isFinite(offset) || offset < 0 || offset * 2 + 64 > raw.length) return [];
      const start = offset * 2;
      const len = Number(BigInt("0x" + raw.slice(start, start + 64)));
      if (!Number.isFinite(len) || len < 0) return [];
      const rows = [];
      let p = start + 64;
      for (let i = 0; i < len && i < 80; i++) {
        if (p + 320 > raw.length) break;
        const shares = BigInt("0x" + raw.slice(p, p + 64)); p += 64;
        const releaseTime = BigInt("0x" + raw.slice(p, p + 64)); p += 64;
        const pool = "0x" + raw.slice(p + 24, p + 64); p += 64;
        const isClaimed = BigInt("0x" + raw.slice(p, p + 64)) !== 0n; p += 64;
        const amount = BigInt("0x" + raw.slice(p, p + 64)); p += 64;
        rows.push({ shares, releaseTime, pool, isClaimed, amount });
      }
      return rows;
    } catch { return []; }
  }

  async function position(pool) {
    const empty = { wallet: 0n, principal: 0n, yieldAmt: 0n, unbonding: 0n, first: 0n };
    if (!state.account) return empty;
    const bal = hexToBig(await rpc("eth_getBalance", [state.account, "latest"]));
    empty.wallet = bal;
    if (!isAddr(pool)) return empty;
    const a = addrWord(state.account);
    const p = addrWord(pool);
    const [pr, un, yi, first] = await Promise.all([
      ethCall(P.sel.stakerPrincipal + a + p).catch(() => "0x0"),
      ethCall(P.sel.stakerUnbonding + a + p).catch(() => "0x0"),
      ethCall(P.sel.poolStakerYield + p + a).catch(() => "0x0"),
      ethCall(P.sel.userFirstDeposit + a).catch(() => "0x0")
    ]);
    empty.principal = hexToBig(pr);
    empty.unbonding = hexToBig(un);
    empty.yieldAmt = hexToBig(yi);
    empty.first = hexToBig(first);
    return empty;
  }

  function encodeUnstake(staker, amount, pools) {
    let data = P.sel.unstake + addrWord(staker) + uintWord(amount) + uintWord(96);
    data += uintWord(pools.length);
    for (const p of pools) data += addrWord(p);
    return data;
  }

  const discovered = new Map();
  window.addEventListener("eip6963:announceProvider", (ev) => {
    const d = ev.detail;
    if (d && d.info && d.provider) discovered.set(d.info.uuid || d.info.rdns || d.info.name, d);
  });
  try { window.dispatchEvent(new Event("eip6963:requestProvider")); } catch {}

  function injectedFallbacks() {
    const list = [];
    const pairs = [
      ["MetaMask", window.ethereum && window.ethereum.isMetaMask ? window.ethereum : null],
      ["Rabby", window.ethereum && window.ethereum.isRabby ? window.ethereum : null],
      ["Coinbase", window.ethereum && (window.ethereum.isCoinbaseWallet || window.coinbaseWalletExtension) ? (window.coinbaseWalletExtension || window.ethereum) : null],
      ["OKX", window.okxwallet || null],
      ["Bitget", window.bitkeep && window.bitkeep.ethereum ? window.bitkeep.ethereum : null],
      ["Trust", window.trustwallet || (window.ethereum && window.ethereum.isTrust ? window.ethereum : null)],
      ["TokenPocket", window.tokenpocket || (window.ethereum && window.ethereum.isTokenPocket ? window.ethereum : null)],
      ["SafePal", window.safepalProvider || null],
      ["Brave", window.ethereum && window.ethereum.isBraveWallet ? window.ethereum : null],
      ["Binance", window.BinanceChain || null],
      ["Injected", window.ethereum || null]
    ];
    const seen = new Set();
    for (const [name, p] of pairs) {
      if (!p || seen.has(p)) continue;
      seen.add(p);
      list.push({ info: { name, rdns: name.toLowerCase(), icon: "" }, provider: p });
    }
    return list;
  }
  function walletList() {
    const out = [];
    discovered.forEach((d) => out.push(d));
    injectedFallbacks().forEach((d) => {
      if (!out.some((x) => x.provider === d.provider)) out.push(d);
    });
    return out;
  }

  function policyAccepted() { return localStorage.getItem("c1404.policy.v1") === "1"; }
  function acceptPolicy() {
    localStorage.setItem("c1404.policy.v1", "1");
    const el = $("policyModal");
    if (window.bootstrap && el) window.bootstrap.Modal.getOrCreateInstance(el).hide();
  }
  function showPolicyGate() {
    if (policyAccepted()) return;
    if ((document.body.getAttribute("data-page") || "") === "policy") return;
    const el = $("policyModal");
    if (window.bootstrap && el) window.bootstrap.Modal.getOrCreateInstance(el).show();
  }
  function sessionOn() { return localStorage.getItem(K.wantSession) === "1"; }
  function rememberWallet(entry, account) {
    const id = (entry.info && (entry.info.rdns || entry.info.name)) || "injected";
    localStorage.setItem(K.walletId, id);
    localStorage.setItem(K.wantSession, "1");
    if (account) localStorage.setItem(K.account, account);
  }
  function disconnectWallet() {
    localStorage.removeItem(K.wantSession);
    localStorage.removeItem(K.walletId);
    localStorage.removeItem(K.account);
    state.account = null;
    state.provider = null;
    state.walletName = "";
    paintWalletBtn();
    refresh();
  }

  async function connectWith(entry) {
    const provider = entry.provider;
    const accs = await provider.request({ method: "eth_requestAccounts" });
    state.provider = provider;
    state.account = accs[0] || null;
    state.walletName = (entry.info && entry.info.name) || "Wallet";
    rememberWallet(entry, state.account);
    bindProvider(provider);
    await ensureChain();
    await refresh();
    hideWalletModal();
  }
  async function silentReconnect() {
    if (!sessionOn()) return;
    const want = localStorage.getItem(K.walletId);
    const list = walletList();
    const entry =
      list.find((d) => (d.info.rdns || d.info.name) === want) ||
      list.find((d) => d.provider === window.ethereum) ||
      list[0];
    if (!entry) return;
    let accs = [];
    try { accs = await entry.provider.request({ method: "eth_accounts" }); } catch {}
    if (!accs || !accs.length) return;
    state.provider = entry.provider;
    state.account = accs[0];
    state.walletName = (entry.info && entry.info.name) || "Wallet";
    bindProvider(entry.provider);
    try { await ensureChain(); } catch {}
  }
  function bindProvider(provider) {
    if (!provider || !provider.on) return;
    provider.removeListener?.("accountsChanged", onAcc);
    provider.removeListener?.("chainChanged", onChain);
    provider.on("accountsChanged", onAcc);
    provider.on("chainChanged", onChain);
  }
  function onAcc(a) {
    state.account = (a && a[0]) || null;
    if (!state.account) disconnectWallet();
    else refresh();
  }
  function onChain() { refresh(); }

  async function ensureChain() {
    if (!state.provider) return;
    try {
      await state.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: P.chainIdHex }] });
    } catch (e) {
      if (e && e.code === 4902) {
        await state.provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: P.chainIdHex,
            chainName: "BlockDAG Community",
            nativeCurrency: { name: "BDAG", symbol: "BDAG", decimals: 18 },
            rpcUrls: [state.rpc],
            blockExplorerUrls: [P.explorers[0].url]
          }]
        });
      } else if (e && e.code !== 4001) throw e;
    }
  }

  function showWalletModal() {
    renderWalletChoices();
    const el = $("walletModal");
    if (window.bootstrap && el) window.bootstrap.Modal.getOrCreateInstance(el).show();
    else if (el) { el.classList.add("show"); el.style.display = "block"; }
  }
  function hideWalletModal() {
    const el = $("walletModal");
    if (window.bootstrap && el) window.bootstrap.Modal.getOrCreateInstance(el).hide();
    else if (el) el.style.display = "none";
  }
  function renderWalletChoices() {
    const box = $("walletList");
    if (!box) return;
    const list = walletList();
    if (!list.length) {
      box.innerHTML = '<p class="text-secondary mb-0">No wallet found. Open this page inside MetaMask, Rabby, Trust, TokenPocket, SafePal, OKX, Bitget, or another dapp browser.</p>';
      return;
    }
    box.innerHTML = list.map((d, i) => `
      <button type="button" class="wallet-row mb-2" data-w="${i}">
        <i class="fa-solid fa-wallet"></i>
        <span>${d.info.name}</span>
      </button>`).join("");
    box.querySelectorAll("[data-w]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = list[Number(btn.getAttribute("data-w"))];
        connectWith(d).catch((e) => {
          pushErr(e.message || "Wallet connect failed");
          alert(sanitize(e.message || "Wallet connect failed"));
        });
      });
    });
  }

  function setStatus(kind, text) {
    const el = $("status");
    if (!el) return;
    el.className = "pill " + kind;
    el.textContent = text;
  }
  function paintWalletBtn() {
    const btn = $("btnWallet");
    const off = $("btnDisconnect");
    const dot = $("walletSignal");
    const warn = $("rpcWarn");
    if (!btn) return;
    const on = !!state.account;
    if (dot) {
      dot.className = "sig " + (on ? "sig-on" : "sig-off");
      dot.title = on ? "Wallet connected" : "Wallet not connected";
    }
    if (warn) {
      warn.classList.toggle("d-none", !state.rpcBad);
      warn.title = state.rpcBad
        ? ("RPC not allowed: " + (state.rpcWhy || "blocked or wrong chain"))
        : "";
    }
    if (on) {
      btn.innerHTML = '<i class="fa-solid fa-wallet me-1"></i>' + short(state.account);
      off?.classList.remove("d-none");
    } else {
      btn.innerHTML = '<i class="fa-solid fa-wallet me-1"></i>Connect';
      off?.classList.add("d-none");
    }
  }

  function gates() {
    const locked = lockedContract();
    const now = nowSec();
    const firstUnlock = state.pos.first ? Number(state.pos.first) + P.constants.bondingSeconds : 0;
    const readyUnbond = (state.unbond || []).filter((r) => !r.isClaimed && Number(r.releaseTime) <= now);
    const waitingUnbond = (state.unbond || []).filter((r) => !r.isClaimed && Number(r.releaseTime) > now);
    const base = !!(locked && state.ready && state.account && !state.blocked && !state.migrate && !state.rpcBad);
    const canStake = base;
    const canUnstake = base && state.pos.principal > 0n;
    const canClaim = base && (
      (state.pos.yieldAmt > 0n && (!firstUnlock || now >= firstUnlock)) ||
      readyUnbond.length > 0
    );
    return { locked, firstUnlock, readyUnbond, waitingUnbond, canStake, canUnstake, canClaim };
  }
  function claimWhy(g) {
    if (!g.locked) return "Choose a staking position first";
    if (!state.account) return "Connect a wallet";
    if (state.rpcBad) return "RPC not allowed";
    if (g.readyUnbond.length) return "";
    if (state.pos.yieldAmt > 0n && g.firstUnlock && nowSec() < g.firstUnlock) return "First-claim wait still running";
    if ((state.unbond || []).some((r) => !r.isClaimed)) return "Unstake still in the wait window";
    return "Nothing ready to claim";
  }
  function paintActions() {
    const g = gates();
    const set = (id, on, why) => {
      const btn = $(id);
      if (!btn) return;
      btn.disabled = !on;
      btn.title = on ? "" : why;
    };
    set("btnStake", g.canStake, !g.locked ? "Choose a staking position first" : "Wallet or network not ready");
    set("btnUnstake", g.canUnstake, !g.locked ? "Choose a staking position first" : "Nothing staked to unstake");
    set("btnClaim", g.canClaim, claimWhy(g));
    const badge = $("lockBadge");
    const line = $("lockedLine");
    if (badge) {
      badge.textContent = g.locked ? "Using this position" : "No position selected";
      badge.className = "badge " + (g.locked ? "text-bg-success" : "text-bg-secondary");
    }
    if (line) {
      line.textContent = g.locked
        ? ("Using position " + short(g.locked.address) + " this session only · " + g.locked.address)
        : "Connect, wait for your staking-contract positions to list, then tap Use this position. Nothing is pre-selected.";
    }
  }

  function fmtRemain(sec) {
    if (sec <= 0) return "Ready now";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d) return d + "d " + h + "h " + m + "m " + s + "s";
    if (h) return h + "h " + m + "m " + s + "s";
    return m + "m " + s + "s";
  }
  function nextWait() {
    const g = gates();
    const now = nowSec();
    const claimWait = (state.pos.yieldAmt > 0n && g.firstUnlock > now)
      ? { kind: "First claim", end: g.firstUnlock, start: Number(state.pos.first) || (g.firstUnlock - P.constants.bondingSeconds) }
      : null;
    const unbondWait = g.waitingUnbond
      .map((r) => ({
        kind: "Unstake release",
        end: Number(r.releaseTime),
        start: Number(r.releaseTime) - P.constants.unbondingSeconds,
        amount: r.amount
      }))
      .sort((a, b) => a.end - b.end)[0];
    return [claimWait, unbondWait].filter(Boolean).sort((a, b) => a.end - b.end)[0] || null;
  }
  function paintLiveNum(id, wei) {
    const el = $(id);
    if (!el) return;
    const next = fmt(wei);
    const prev = el.getAttribute("data-v");
    el.textContent = next;
    if (prev && prev !== next) {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
    el.setAttribute("data-v", next);
  }
  function paintRewardTrack() {
    const fill = $("rewFill");
    const lab = $("rewLiveHint");
    if (!fill && !lab) return;
    const g = gates();
    const now = nowSec();
    const first = Number(state.pos.first || 0n);
    const unlock = first ? first + P.constants.bondingSeconds : 0;
    if (lab) {
      if (!state.account) lab.textContent = "Connect to stream rewards and unbonding.";
      else if (!g.locked) lab.textContent = "Choose a listed staking position to filter this card. Totals below include every live position.";
      else if (state.pos.yieldAmt === 0n && state.pos.unbonding === 0n && state.pos.principal === 0n)
        lab.textContent = "No live balance on the selected staking position.";
      else if (state.pos.yieldAmt > 0n && unlock && now < unlock)
        lab.textContent = "Rewards on-chain: " + fmt(state.pos.yieldAmt, 6) + " BDAG · first-claim clock running.";
      else if (state.pos.yieldAmt > 0n)
        lab.textContent = "Rewards on-chain: " + fmt(state.pos.yieldAmt, 6) + " BDAG · claim when the contract allows.";
      else lab.textContent = "Position loaded. Rewards stay 0 until the contract credits yield.";
    }
    if (fill) {
      let pct = 0;
      if (unlock && first) {
        pct = Math.min(100, Math.max(4, ((now - first) / P.constants.bondingSeconds) * 100));
      } else if (state.pos.yieldAmt > 0n) pct = 100;
      else if (state.pos.principal > 0n) pct = 12;
      fill.style.width = pct + "%";
      fill.classList.toggle("live", state.pos.principal > 0n || state.pos.yieldAmt > 0n);
      fill.classList.toggle("ready", !!(unlock && now >= unlock && state.pos.yieldAmt > 0n));
    }
  }
  function paintWait() {
    const card = $("waitCard");
    if (!card) return;
    const fill = $("waitFill");
    const w = nextWait();
    const g = gates();
    if (!w) {
      $("waitLabel").textContent = "No wait";
      $("waitClock").textContent = "Ready";
      $("waitHint").textContent = g.canClaim
        ? "Claim is available."
        : g.canUnstake
          ? "You can request an unstake."
          : g.locked
            ? "A position is selected this session. Connect if buttons stay off."
            : "Choose a staking position first.";
      if (fill) {
        fill.style.width = "100%";
        fill.classList.add("ready");
      }
      return;
    }
    const now = nowSec();
    const left = Math.max(0, w.end - now);
    const span = Math.max(1, w.end - w.start);
    const done = Math.min(100, ((span - left) / span) * 100);
    $("waitLabel").textContent = w.kind;
    $("waitClock").textContent = fmtRemain(left);
    $("waitHint").textContent = w.amount
      ? (fmt(w.amount) + " BDAG can be claimed when this hits zero.")
      : "Claim stays off until this hits zero. The contract can still refuse.";
    if (fill) {
      fill.classList.toggle("ready", left <= 0);
      fill.style.width = done + "%";
    }
  }
  let waitTimer = null;
  function startWaitClock() {
    if (waitTimer) clearInterval(waitTimer);
    paintWait();
    waitTimer = setInterval(() => {
      paintWait();
      paintActions();
    }, 1000);
  }

  async function inspectContract(addr) {
    const empty = { address: addr, principal: 0n, yieldAmt: 0n, unbonding: 0n, total: 0n, engaged: false };
    if (!isAddr(addr)) return empty;
    const p = addrWord(addr);
    const total = hexToBig(await ethCall(P.sel.poolTotalStake + p).catch(() => "0x0"));
    if (!state.account) return { ...empty, total };
    const a = addrWord(state.account);
    const [pr, un, yi] = await Promise.all([
      ethCall(P.sel.stakerPrincipal + a + p).catch(() => "0x0"),
      ethCall(P.sel.stakerUnbonding + a + p).catch(() => "0x0"),
      ethCall(P.sel.poolStakerYield + p + a).catch(() => "0x0")
    ]);
    const principal = hexToBig(pr);
    const unbonding = hexToBig(un);
    const yieldAmt = hexToBig(yi);
    return {
      address: addr.toLowerCase(),
      principal, unbonding, yieldAmt, total,
      engaged: principal + unbonding + yieldAmt > 0n
    };
  }
  function knownAddresses() {
    const out = [];
    const add = (addr, label) => {
      if (!isAddr(addr) || isStakingProxy(addr)) return;
      const k = addr.toLowerCase();
      if (out.some((x) => x.address === k)) return;
      out.push({ address: k, label: label || ("Position " + short(addr)) });
    };
    (state.positions || []).forEach((r) => add(r.address, r.label));
    rememberedPositions().forEach((r) => add(r.address, r.label || "Earlier position"));
    (state.unbond || []).forEach((r) => add(r.pool, "Unbonding"));
    loadLog().forEach((r) => { if (r.pool) add(r.pool, r.action || "From your log"); });
    const picked = lockedContract();
    if (picked) add(picked.address, picked.label || "Selected this session");
    const q = ($("contractQuery") && $("contractQuery").value.trim()) || "";
    if (isAddr(q)) add(q, "Search");
    return out;
  }
  async function explorerGet(path) {
    const explorers = (P.explorers || []).map((e) => String(e.url || "").replace(/\/$/, "")).filter(Boolean);
    for (const base of explorers) {
      try {
        const ctrl = AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
        const r = await fetch(base + path, { headers: { Accept: "application/json" }, signal: ctrl });
        if (r.ok) return await r.json();
      } catch {}
    }
    return null;
  }
  function poolFromStakeInput(input) {
    const raw = String(input || "").replace(/^0x/, "").toLowerCase();
    if (raw.length < 8 + 192) return "";
    if (raw.slice(0, 8) !== "294091cd") return "";
    return "0x" + raw.slice(8 + 128, 8 + 192).slice(24);
  }
  async function discoverOnChainPositions() {
    if (!state.account) return [];
    const acc = state.account.toLowerCase();
    const found = [];
    const add = (addr, label) => {
      if (!isAddr(addr) || isStakingProxy(addr)) return;
      const k = addr.toLowerCase();
      if (found.some((x) => x.address === k)) return;
      found.push({ address: k, label: label || ("Position " + short(k)) });
    };
    let page = await explorerGet("/api/v2/addresses/" + acc + "/transactions");
    let pages = 0;
    while (page && pages < 6) {
      pages += 1;
      for (const it of (page.items || [])) {
        const to = ((it.to && it.to.hash) || it.to || "").toLowerCase();
        if (!allContracts().some((c) => (c.proxy || "").toLowerCase() === to)) continue;
        const pool = poolFromStakeInput(it.raw_input || it.input || "");
        if (pool) add(pool, "On-chain stake");
      }
      const n = page.next_page_params;
      if (!n) break;
      const q = Object.entries(n).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
      page = await explorerGet("/api/v2/addresses/" + acc + "/transactions?" + q);
    }
    (state.unbond || []).forEach((r) => add(r.pool, "Unbonding"));
    rememberedPositions().forEach((r) => add(r.address, r.label || "Earlier position"));
    loadLog().forEach((r) => add(r.pool, r.action || "From your log"));
    state.posScanAt = Date.now();
    return found;
  }
  async function loadPositions(force) {
    if (!state.account) {
      state.positions = [];
      return [];
    }
    const stale = !state.posScanAt || (Date.now() - state.posScanAt > 90 * 1000);
    const seeds = (force || stale || !state.positions.length) ? await discoverOnChainPositions() : (state.positions || []);
    const rows = [];
    for (const seed of seeds) {
      const inspected = await inspectContract(seed.address);
      const row = { ...seed, ...inspected, isProxy: false };
      if (row.engaged) rememberPosition(row.address, row.label);
      rows.push(row);
    }
    rows.sort((a, b) => {
      if (a.engaged !== b.engaged) return a.engaged ? -1 : 1;
      if (b.yieldAmt !== a.yieldAmt) return b.yieldAmt > a.yieldAmt ? 1 : -1;
      return b.principal > a.principal ? 1 : -1;
    });
    state.positions = rows;
    return rows;
  }
  function renderPositionCards(rows, extra) {
    const box = $("contractHits");
    if (!box) return;
    const q = (($("contractQuery") && $("contractQuery").value) || "").trim().toLowerCase();
    const picked = lockedContract();
    let list = (rows || []).concat(extra || []);
    const seen = new Set();
    list = list.filter((r) => {
      const k = (r.address || "").toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      if (q && !k.includes(q) && !(r.label || "").toLowerCase().includes(q)) return false;
      return true;
    });
    const engaged = list.filter((r) => r.engaged);
    const rest = list.filter((r) => !r.engaged);
    const card = (r) => {
      const isPicked = picked && picked.address === r.address;
      const title = r.engaged ? "Open staking position" : "No live balance on this position";
      return `<div class="glass p-3 mb-2">
        <div class="d-flex justify-content-between gap-2 flex-wrap">
          <div>
            <div class="fw-semibold">${title}</div>
            <div class="addr small">${r.address}</div>
            <div class="small mt-1">Staked <strong>${fmt(r.principal, 6)}</strong> BDAG · Yield <strong>${fmt(r.yieldAmt, 6)}</strong> BDAG · Unbonding <strong>${fmt(r.unbonding, 6)}</strong> BDAG</div>
          </div>
          <button type="button" class="btn btn-sm ${isPicked ? "btn-ghost" : "btn-accent"}" data-lock="${r.address}" ${isPicked ? "disabled" : ""}>
            ${isPicked ? "Using this position" : "Use this position"}
          </button>
        </div>
      </div>`;
    };
    const sumP = engaged.reduce((s, r) => s + (r.principal || 0n), 0n);
    const sumY = engaged.reduce((s, r) => s + (r.yieldAmt || 0n), 0n);
    const head = state.account
      ? (engaged.length
          ? `<p class="small mb-2">Your staking-contract positions · ${engaged.length} live · total staked ${fmt(sumP, 6)} BDAG · total yield ${fmt(sumY, 6)} BDAG. Nothing is selected until you tap Use this position.</p>`
          : `<p class="small mb-2">No live staking-contract position found for this wallet yet. Search an existing position 0x only if you already staked to it.</p>`)
      : `<p class="small mb-2">Connect a wallet to list staking-contract positions and yields. The app will not pick one for you.</p>`;
    box.innerHTML =
      head +
      (engaged.length ? engaged.map(card).join("") : "") +
      (rest.length ? "<p class='small mt-3 mb-2'>Looked-up addresses with no live balance</p>" + rest.map(card).join("") : "") +
      (!list.length && q ? "<p class='small text-secondary'>No position matched that search.</p>" : "");
    box.querySelectorAll("[data-lock]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = list.find((r) => r.address === btn.getAttribute("data-lock"));
        if (row) lockContract(row);
      });
    });
  }
  async function searchContracts() {
    const box = $("contractHits");
    if (!box) return;
    box.innerHTML = "<p class='small text-secondary'>Reading your staking-contract positions…</p>";
    const q = (($("contractQuery") && $("contractQuery").value) || "").trim();
    const extra = [];
    if (isAddr(q) && !isStakingProxy(q)) extra.push({ address: q.toLowerCase(), label: "Search", ...(await inspectContract(q)) });
    const rows = await loadPositions(true);
    renderPositionCards(rows, extra);
  }

  function loadPulse() {
    try { return JSON.parse(localStorage.getItem(K.pulse) || "[]"); } catch { return []; }
  }
  function savePulse(rows) {
    localStorage.setItem(K.pulse, JSON.stringify(rows.slice(-48)));
  }
  async function readPulse() {
    const proxy = activeContract().proxy;
    const pool = currentPool();
    const balHex = await rpc("eth_getBalance", [proxy, "latest"]).catch(() => "0x0");
    const stakeHex = (pool && isAddr(pool))
      ? await ethCall(P.sel.poolTotalStake + addrWord(pool)).catch(() => "0x0")
      : "0x0";
    const now = { t: Date.now(), balance: hexToBig(balHex).toString(), totalStake: hexToBig(stakeHex).toString() };
    const hist = loadPulse();
    const last = hist[hist.length - 1];
    if (!last || last.balance !== now.balance || last.totalStake !== now.totalStake || Date.now() - last.t > 15 * 60 * 1000) {
      hist.push(now);
      savePulse(hist);
    }
    const prev = hist.find((s) => now.t - s.t >= 60 * 60 * 1000) || hist[0];
    const delta = hexToBig(now.balance) - hexToBig(prev ? prev.balance : now.balance);
    state.pulse = { balance: hexToBig(now.balance), totalStake: hexToBig(now.totalStake), delta, t: now.t, prevT: prev && prev.t };
    const changed = [...hist].reverse().find((s, i, arr) => {
      const nxt = hist[hist.length - 1];
      return s.balance !== nxt.balance || s.totalStake !== nxt.totalStake;
    });
    const age = changed ? now.t - changed.t : Infinity;
    state.pulse.status = age < 2 * 3600 * 1000 ? "Active" : age < 24 * 3600 * 1000 ? "Quiet" : "Idle";
  }
  function paintPulse() {
    if (!$("pulseCard")) return;
    const p = state.pulse;
    if ($("pulseBal")) $("pulseBal").textContent = fmt(p.balance) + " BDAG in manager";
    const el = $("pulseDelta");
    if (el) {
      const sign = p.delta > 0n ? "+" : p.delta < 0n ? "−" : "";
      const abs = p.delta < 0n ? -p.delta : p.delta;
      el.className = "small mb-1 " + (p.delta > 0n ? "pulse-up" : p.delta < 0n ? "pulse-down" : "pulse-flat");
      el.textContent = (p.delta === 0n ? "No BDAG moved in the watched window" : (sign + fmt(abs) + " BDAG vs earlier snapshot"));
    }
    if ($("pulseWhen")) $("pulseWhen").textContent = p.status === "Active"
      ? "Money has moved recently. Contract looks active."
      : p.status === "Quiet"
        ? "Little movement in the last few hours."
        : "No movement seen in the last day — or this device just started watching.";
    const st = $("pulseStatus");
    if (st) {
      st.textContent = p.status || "Checking…";
      st.className = "badge " + (p.status === "Active" ? "text-bg-success" : p.status === "Quiet" ? "text-bg-warning" : "text-bg-secondary");
    }
  }

  function paintShareTable() {
    const tb = $("shareTable") && $("shareTable").querySelector("tbody");
    if (!tb) return;
    const rows = (state.positions || []).filter((r) => r.engaged || (r.total && r.total > 0n));
    if (!rows.length) {
      tb.innerHTML = "<tr><td class='text-secondary'>No staking-contract position loaded yet.</td></tr>";
      if ($("shareHint")) $("shareHint").textContent = "Connect a wallet. Positions and yield load from the staking contract.";
      return;
    }
    const picked = (currentPool() || "").toLowerCase();
    tb.innerHTML = "<tr><th>Position</th><th>Your stake</th><th>Your yield</th><th>Position total</th><th>Your share</th></tr>" + rows.map((r) => {
      const share = pctBn(r.principal || 0n, r.total || 0n, 4);
      const mark = picked && r.address === picked ? " · this session" : "";
      return `<tr>
        <td class="addr">${short(r.address)}${mark}<div class="small text-secondary">${r.address}</div></td>
        <td>${fmt(r.principal, 4)}</td>
        <td>${fmt(r.yieldAmt, 4)}</td>
        <td>${fmt(r.total, 2)}</td>
        <td>${share}</td>
      </tr>`;
    }).join("");
    const live = rows.filter((r) => r.engaged);
    const p = live.reduce((s, r) => s + (r.principal || 0n), 0n);
    const y = live.reduce((s, r) => s + (r.yieldAmt || 0n), 0n);
    if ($("shareHint")) $("shareHint").textContent = live.length
      ? (live.length + " live position(s) · your principal " + fmt(p, 4) + " BDAG · your yield " + fmt(y, 6) + " BDAG.")
      : "Positions listed below have pool totals but this wallet has no live principal on them.";
  }
  async function loadInsightExtras() {
    if (state.insight && Date.now() - (state.insight.at || 0) < 6 * 60 * 1000) return state.insight;
    const proxy = activeContract().proxy;
    const stats = await explorerGet("/api/v2/stats") || {};
    const addrs = await explorerGet("/api/v2/addresses") || {};
    const whales = (addrs.items || []).slice(0, 10).map((it, i) => ({
      rank: i + 1,
      hash: it.hash,
      bal: BigInt(it.coin_balance || "0"),
      contract: !!it.is_contract,
      txs: it.transactions_count || "0"
    }));
    const supply = BigInt(addrs.total_supply || stats.total_supply || "0");
    let vault = 0n;
    try { vault = hexToBig(await rpc("eth_getBalance", [proxy, "latest"])); } catch {}
    const stakes = [];
    let page = await explorerGet("/api/v2/addresses/" + proxy + "/transactions");
    let pages = 0;
    while (page && pages < 5) {
      pages += 1;
      for (const it of (page.items || [])) {
        if (it.status !== "ok" && it.result !== "success") continue;
        const input = it.raw_input || it.input || "";
        if (!String(input).toLowerCase().startsWith("0x294091cd")) continue;
        const from = ((it.from && it.from.hash) || "").toLowerCase();
        const pool = poolFromStakeInput(input);
        const amt = BigInt(it.value || "0");
        stakes.push({ from, pool, amt, ts: it.timestamp, hash: it.hash });
      }
      const n = page.next_page_params;
      if (!n) break;
      const q = Object.entries(n).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
      page = await explorerGet("/api/v2/addresses/" + proxy + "/transactions?" + q);
    }
    stakes.sort((a, b) => (a.amt < b.amt ? 1 : -1));
    const seen = new Set();
    const topStakes = [];
    for (const s of stakes) {
      const k = s.from + ":" + s.pool;
      if (seen.has(k)) continue;
      seen.add(k);
      topStakes.push(s);
      if (topStakes.length >= 10) break;
    }
    state.insight = { at: Date.now(), stats, whales, supply, vault, topStakes, sample: stakes.length };
    return state.insight;
  }
  function paintInsightExtras() {
    const d = state.insight;
    if (!d) return;
    const box = $("insightStats");
    if (box) {
      const you = state.account ? state.pos.wallet + state.pos.principal + state.pos.yieldAmt + state.pos.unbonding : 0n;
      const cards = [
        ["Addresses", (d.stats.total_addresses || "—").toString()],
        ["Blocks", Number(d.stats.total_blocks || 0).toLocaleString()],
        ["Txs", Number(d.stats.total_transactions || 0).toLocaleString()],
        ["Block time", (d.stats.average_block_time ? (Number(d.stats.average_block_time) / 1000).toFixed(2) + "s" : "—")],
        ["Staking vault", fmt(d.vault, 0) + " BDAG"],
        ["Your footprint", state.account ? fmt(you, 2) + " BDAG" : "Connect"],
        ["Vs vault", d.vault > 0n && state.account ? pctBn(state.pos.principal + state.pos.yieldAmt, d.vault, 4) : "—"],
        ["Sampled stakes", String(d.sample || 0)]
      ];
      box.innerHTML = cards.map(([k, v]) => `<div class="col-6 col-md-3"><div class="glass p-2 h-100"><div class="small text-secondary">${k}</div><div class="fw-semibold">${v}</div></div></div>`).join("");
    }
    const wt = $("whaleTable") && $("whaleTable").querySelector("tbody");
    if (wt) {
      const me = (state.account || "").toLowerCase();
      wt.innerHTML = "<tr><th>#</th><th>Wallet</th><th>Liquid BDAG</th><th>Share of listed top 10</th><th></th></tr>" + d.whales.map((w) => {
        const listed = d.whales.reduce((s, x) => s + x.bal, 0n) || 1n;
        const you = me && w.hash.toLowerCase() === me;
        return `<tr class="${you ? "table-active" : ""}">
          <td>${w.rank}</td>
          <td class="addr">${short(w.hash)}${w.contract ? " · contract" : ""}${you ? " · you" : ""}<div class="small text-secondary">${w.hash}</div></td>
          <td>${fmt(w.bal, 0)}</td>
          <td>${pctBn(w.bal, listed, 2)}</td>
          <td class="small text-secondary">${w.txs} tx</td>
        </tr>`;
      }).join("");
    }
    const st = $("stakeWhaleTable") && $("stakeWhaleTable").querySelector("tbody");
    if (st) {
      const me = (state.account || "").toLowerCase();
      if (!d.topStakes.length) {
        st.innerHTML = "<tr><td class='text-secondary'>No recent stake() calls in the sampled pages.</td></tr>";
      } else {
        st.innerHTML = "<tr><th>#</th><th>Staker</th><th>Amount</th><th>Position</th><th>When</th></tr>" + d.topStakes.map((s, i) => {
          const you = me && s.from === me;
          return `<tr class="${you ? "table-active" : ""}">
            <td>${i + 1}</td>
            <td class="addr">${short(s.from)}${you ? " · you" : ""}</td>
            <td>${fmt(s.amt, 2)}</td>
            <td class="addr">${short(s.pool)}</td>
            <td class="small">${s.ts ? new Date(s.ts).toLocaleString() : "—"}</td>
          </tr>`;
        }).join("");
      }
    }
  }
  function bars(canvas, rows) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth || 320;
    const h = canvas.height = 180;
    ctx.clearRect(0, 0, w, h);
    if (!rows || !rows.length) return;
    const max = Math.max(1, ...rows.map((r) => r.v));
    const bw = Math.max(8, (w - 20) / rows.length - 8);
    rows.forEach((r, i) => {
      const x = 10 + i * (bw + 8);
      const bh = (r.v / max) * (h - 28);
      ctx.fillStyle = r.c || "#3ee0ff";
      ctx.fillRect(x, h - 18 - bh, bw, bh);
      ctx.fillStyle = "#8aa6c2";
      ctx.font = "10px sans-serif";
      ctx.fillText(String(r.l).slice(0, 8), x, h - 4);
    });
  }
  function pie(canvas, parts) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth || 320;
    const h = canvas.height = 180;
    ctx.clearRect(0, 0, w, h);
    const usable = (parts || []).filter((p) => p.v > 0);
    const total = usable.reduce((s, p) => s + p.v, 0);
    if (!total) {
      ctx.fillStyle = "#8aa6c2";
      ctx.font = "12px sans-serif";
      ctx.fillText("Nothing to plot yet", 12, 24);
      return;
    }
    let a = -Math.PI / 2;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8;
    usable.forEach((p) => {
      const slice = (p.v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, a + slice);
      ctx.closePath();
      ctx.fillStyle = p.c;
      ctx.fill();
      a += slice;
    });
  }
  function setLegend(id, parts) {
    const el = $(id);
    if (!el) return;
    const total = (parts || []).reduce((s, p) => s + (Number(p.v) || 0), 0) || 1;
    el.innerHTML = (parts || []).map((p) => {
      const pct = ((Number(p.v) || 0) / total) * 100;
      return `<span class="me-3"><span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:${p.c};margin-right:6px"></span>${p.l || ""} · ${pct.toFixed(2)}%</span>`;
    }).join("");
  }
  function pctBn(part, whole, digits) {
    try {
      const p = typeof part === "bigint" ? part : BigInt(part || 0);
      const w = typeof whole === "bigint" ? whole : BigInt(whole || 0);
      if (w <= 0n) return "—";
      const scale = 10n ** BigInt(digits || 4);
      const n = (p * scale * 100n) / w;
      const wholeN = n / scale;
      const frac = (n % scale).toString().padStart(digits || 4, "0");
      return wholeN.toString() + "." + frac + "%";
    } catch { return "—"; }
  }
  function drawCharts() {
    const mix = [
      { l: "Liquid wallet", v: asNum(state.pos.wallet), c: "#f5c16c" },
      { l: "Staked", v: asNum(state.pos.principal), c: "#7ee0b0" },
      { l: "Yield", v: asNum(state.pos.yieldAmt), c: "#4ade80" },
      { l: "Unbonding", v: asNum(state.pos.unbonding), c: "#fb7185" }
    ];
    pie($("chartMix"), mix);
    setLegend("mixLegend", mix);
    const posTotal = currentPool() && (state.positions || []).find((r) => r.address === (currentPool() || "").toLowerCase());
    const poolTot = posTotal ? asNum(posTotal.total) : 0;
    const mine = asNum(state.pos.principal) + asNum(state.pos.yieldAmt);
    const rest = Math.max(0, poolTot - asNum(state.pos.principal));
    const shareParts = currentPool()
      ? [
          { l: "Your principal", v: asNum(state.pos.principal), c: "#7ee0b0" },
          { l: "Rest of this position", v: rest, c: "#334155" }
        ]
      : [
          { l: "Your live principal (all positions)", v: asNum(state.pos.principal), c: "#7ee0b0" },
          { l: "Not compared until a position is selected", v: 0, c: "#334155" }
        ];
    pie($("chartShare"), shareParts);
    setLegend("shareLegend", shareParts);
    const remain = state.nextEpoch || 0;
    const used = Math.max(0, P.constants.epochSeconds - remain);
    bars($("chartEpoch"), [
      { l: "used", v: used, c: "#f5c16c" },
      { l: "left", v: remain, c: "#7ee0b0" }
    ]);
    if ($("epochFill")) {
      const pct = Math.min(100, (used / P.constants.epochSeconds) * 100);
      $("epochFill").style.width = pct + "%";
    }
    const split = [
      { l: "Miner split", v: state.minerSplit, c: "#f5c16c" },
      { l: "Staker split", v: state.stakerSplit, c: "#7ee0b0" }
    ];
    pie($("chartSplit"), split);
    setLegend("splitLegend", split);
    const days = {};
    loadLog().forEach((row) => {
      const d = new Date(row.t).toISOString().slice(5, 10);
      days[d] = (days[d] || 0) + 1;
    });
    const keys = Object.keys(days).slice(0, 10).reverse();
    bars($("chartActivity"), keys.map((k) => ({ l: k.slice(3), v: days[k], c: "#f5c16c" })));
    const open = state.unbond.filter((x) => !x.isClaimed);
    bars($("chartUnbond"), open.slice(0, 8).map((x, i) => ({
      l: "R" + (i + 1),
      v: asNum(x.amount),
      c: Number(x.releaseTime) <= nowSec() ? "#4ade80" : "#f5c16c"
    })));
    bars($("chartRpc"), state.rpcMs.map((n) => ({
      l: n.name.split(" ")[0].slice(0, 6),
      v: n.ok ? Math.max(1, n.ms) : 0,
      c: n.ok ? "#4ade80" : "#fb7185"
    })));
  }

  async function refresh() {
    try {
      setStatus("wait", "…");
      await pickRpc();
      await safetyChecks();
      await Promise.all([readEpoch(), readFlags()]);
      if (state.migrate) setStatus("wait", "Review");
      else if (!state.ready) setStatus("stop", "Stop");
      else if (state.rpcBad) setStatus("wait", "RPC");
      else setStatus("ok", "OK");
      if ($("detail")) $("detail").textContent = state.reason || (
        state.account
          ? ("Connected via " + (state.walletName || "wallet") + ". Using " + state.rpcName + ".")
          : "Connect a wallet from the header to see your position."
      );
      if ($("epochLine")) {
        const ready = new Date((nowSec() + state.nextEpoch) * 1000);
        $("epochLine").textContent = "Week " + state.epoch + " · next week around " + ready.toLocaleString();
      }
      if (state.account) {
        try { state.unbond = decodeUnbonding(await ethCall(P.sel.getUnbondingRequests + addrWord(state.account))); }
        catch { state.unbond = []; }
      } else {
        state.unbond = [];
        state.positions = [];
      }
      try { await loadPositions(false); } catch { }
      try { renderPositionCards(state.positions || []); } catch { }
      const pool = currentPool();
      if (isAddr(pool)) {
        state.pos = await position(pool);
      } else {
        const live = (state.positions || []).filter((r) => r.engaged);
        const wallet = state.account ? hexToBig(await rpc("eth_getBalance", [state.account, "latest"]).catch(() => "0x0")) : 0n;
        let first = 0n;
        try { if (state.account) first = hexToBig(await ethCall(P.sel.userFirstDeposit + addrWord(state.account))); } catch { first = 0n; }
        state.pos = {
          wallet,
          principal: live.reduce((s, r) => s + (r.principal || 0n), 0n),
          yieldAmt: live.reduce((s, r) => s + (r.yieldAmt || 0n), 0n),
          unbonding: live.reduce((s, r) => s + (r.unbonding || 0n), 0n),
          first
        };
      }
      paintLiveNum("bal", state.pos.wallet);
      paintLiveNum("staked", state.pos.principal);
      paintLiveNum("rew", state.pos.yieldAmt);
      paintLiveNum("unbond", state.pos.unbonding);
      paintRewardTrack();
      if ($("firstStake")) {
        if (!state.account) $("firstStake").textContent = "";
        else if (state.pos.first === 0n) $("firstStake").textContent = "No first deposit recorded for this wallet.";
        else {
          const unlock = Number(state.pos.first) + P.constants.bondingSeconds;
          $("firstStake").textContent = nowSec() >= unlock
            ? "Past the first 4-week wait (the contract still decides each claim)."
            : "First lock until about " + dateFromSec(unlock) + ".";
        }
      }
      if ($("unbondList")) {
        const open = state.unbond.filter((r) => !r.isClaimed);
        $("unbondList").innerHTML = open.length
          ? open.map((r) => {
            const left = Math.max(0, Number(r.releaseTime) - nowSec());
            return `<li>${fmt(r.amount)} BDAG · ${left ? fmtRemain(left) : "ready to claim"} · ${short(r.pool)}</li>`;
          }).join("")
          : "<li>No open unstake requests.</li>";
      }
      try { await readPulse(); paintPulse(); } catch {}
      try { await loadAndPaintSplit(); } catch (err) { paintSplitError(err); }
    } catch (e) {
      state.ready = false;
      state.rpcBad = true;
      state.rpcWhy = e.message || "RPC failed";
      setStatus("stop", sanitize(e.message || "Stopped"));
      if ($("detail")) $("detail").textContent = sanitize(e.message || "Stopped");
      if (!window.__c1404quiet) pushErr(e.message || "Refresh failed");
    }
    paintWalletBtn();
    paintActions();
    paintWait();
    renderLog();
    drawCharts();
    renderContracts();
    paintShareTable();
    if (document.body && document.body.getAttribute("data-page") === "insights") {
      loadInsightExtras().then(paintInsightExtras).catch((e) => {
        if ($("whaleTable")) $("whaleTable").innerHTML = "<tr><td>Could not load explorer lists.</td></tr>";
      });
    }
  }

  async function sendTx(action, data, value, amountLabel) {
    if (!policyAccepted()) { showPolicyGate(); return alert("Accept the Policy and User Agreement first."); }
    if (!state.provider || !state.account) return alert("Connect a wallet first.");
    const g = gates();
    if (!g.locked) return alert("Choose a staking position first. The app does not pick one for you.");
    const hash = await state.provider.request({
      method: "eth_sendTransaction",
      params: [{
        from: state.account,
        to: activeContract().proxy,
        data,
        value: "0x" + BigInt(value || 0).toString(16)
      }]
    });
    addLog({ action, amount: amountLabel, status: "pending", hash: hash ? hash.slice(0, 18) : "", note: "Waiting", pool: currentPool() });
    let rec = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      rec = await rpc("eth_getTransactionReceipt", [hash], 5000);
      if (rec) break;
    }
    const ok = rec && hexToBig(rec.status) === 1n;
    addLog({ action, amount: amountLabel, status: ok ? "done" : rec ? "failed" : "pending", hash: hash ? hash.slice(0, 18) : "", note: ok ? "Confirmed" : rec ? "Reverted" : "Still waiting", pool: currentPool() });
    await refresh();
  }

  async function doStake() {
    const g = gates();
    if (!g.canStake) return alert("Stake is not available yet.");
    const pool = currentPool();
    if (!isAddr(pool)) return alert("Choose a staking position first. The app does not pick one for you.");
    setPool(pool);
    if (!(await warnIfBadPool(pool, "Stake"))) return;
    let amt;
    try { amt = parseAmount($("amount").value); } catch (e) { return alert(e.message); }
    if (amt < BigInt(P.constants.minStakeWei)) return alert("Minimum stake is 0.001 BDAG.");
    const data = P.sel.stake + addrWord(state.account) + uintWord(amt) + addrWord(pool);
    try {
      await rpc("eth_call", [{ to: activeContract().proxy, from: state.account, data, value: "0x" + amt.toString(16) }, "latest"]);
    } catch (e) { return alert("This stake would fail: " + sanitize(e.message)); }
    await sendTx("Stake", data, amt, fmt(amt) + " BDAG");
  }
  async function doUnstake() {
    const ledger = ($("sendLedger") && $("sendLedger").value) || state.sendLedger || "community";
    state.sendLedger = ledger;
    const pool = currentPool();
    if (!isAddr(pool)) return alert("Choose a staking position first. The app does not pick one for you.");
    setPool(pool);
    let amt;
    try { amt = parseAmount($("amount").value); } catch (e) { return alert(e.message); }
    const data = encodeUnstake(state.account, amt, [pool]);
    if (ledger === "divergent") {
      return doDivergentUnstake(data, amt);
    }
    const g = gates();
    if (!g.canUnstake) return alert("Unstake is not available yet on the community ledger.");
    try { await rpc("eth_call", [{ to: activeContract().proxy, from: state.account, data }, "latest"]); }
    catch (e) { return alert("This unstake would fail on the community ledger: " + sanitize(e.message)); }
    await sendTx("Unstake", data, 0n, fmt(amt) + " BDAG");
  }
  async function doClaim() {
    const ledger = ($("sendLedger") && $("sendLedger").value) || state.sendLedger || "community";
    state.sendLedger = ledger;
    const pool = currentPool();
    if (!isAddr(pool)) return alert("Choose a staking position first. The app does not pick one for you.");
    setPool(pool);
    const data = P.sel.claimStake + addrWord(state.account) + addrWord(pool);
    if (ledger === "divergent") {
      return doDivergentClaim(data);
    }
    const g = gates();
    if (!g.canClaim) return alert(claimWhy(g));
    try { await rpc("eth_call", [{ to: activeContract().proxy, from: state.account, data }, "latest"]); }
    catch (e) { return alert("Claim is not allowed yet: " + sanitize(e.message)); }
    await sendTx("Claim", data, 0n, "claim");
  }



  function renderContracts() {
    const box = $("contractList");
    if (!box) return;
    const live = activeContract();
    box.innerHTML = allContracts().map((c) => {
      const on = live && live.id === c.id;
      return `<div class="glass p-3 mb-2">
        <div class="fw-semibold">${c.label} ${on ? "· in use" : ""}</div>
        <div class="addr small">${c.proxy}</div>
        <div class="small text-secondary">${c.note || ""}</div>
        <div class="d-flex gap-2 mt-2">
          <button type="button" class="btn btn-sm btn-ghost" data-use="${c.id}">Use</button>
          <button type="button" class="btn btn-sm btn-accent" data-accept="${c.id}">Accept live pin</button>
        </div>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-use]").forEach((b) => b.addEventListener("click", () => {
      localStorage.setItem(K.active, b.getAttribute("data-use"));
      refresh();
    }));
    box.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", () => {
      if (!confirm("Only accept after you or the community reviewed the new code. Continue?")) return;
      const id = b.getAttribute("data-accept");
      const pins = acceptedPins();
      pins[id] = { implementation: state.liveImpl, owner: state.liveOwner, at: Date.now() };
      localStorage.setItem(K.accept, JSON.stringify(pins));
      refresh();
    }));
    if ($("liveImpl")) $("liveImpl").textContent = state.liveImpl || "—";
    if ($("liveOwner")) $("liveOwner").textContent = state.liveOwner || "—";
  }
  function addUserContract() {
    const label = ($("newLabel") && $("newLabel").value.trim()) || "Custom";
    const proxy = $("newProxy") && $("newProxy").value.trim();
    const impl = $("newImpl") && $("newImpl").value.trim();
    if (!isAddr(proxy)) return alert("Proxy must be a 0x address.");
    if (impl && !isAddr(impl)) return alert("Implementation must be a 0x address.");
    const list = extraContracts();
    const id = "user-" + Date.now();
    list.push({ id, label, proxy, implementation: impl || proxy, owner: "", abi: "v1", note: "Added on this device" });
    localStorage.setItem(K.extra, JSON.stringify(list));
    localStorage.setItem(K.active, id);
    refresh();
  }


  function paintSplitError(err) {
    const box = $("splitGrid");
    if (box) box.innerHTML = "<p class='small text-secondary mb-0'>" + sanitize((err && err.message) || "Split view unavailable") + "</p>";
  }
  function paintSplitCard(el, title, badge, pos, note) {
    if (!el) return;
    if (!pos) {
      el.innerHTML = "<div class='lbl'>" + title + "</div><div class='small text-secondary'>Waiting…</div>";
      return;
    }
    if (!pos.ok) {
      el.innerHTML = "<div class='d-flex justify-content-between'><div class='lbl'>" + title + "</div><span class='badge text-bg-secondary'>" + badge + "</span></div>"
        + "<p class='small text-secondary mb-0 mt-2'>" + sanitize(pos.why || "No reply") + "</p>";
      return;
    }
    const total = pos.principal + pos.yieldAmt + pos.unbonding;
    el.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="lbl">${title}</div>
        <span class="badge ${badge === "live" ? "text-bg-success" : badge === "history" ? "text-bg-secondary" : "text-bg-warning"}">${badge}</span>
      </div>
      <div class="small text-secondary mb-2">${pos.rpcName || ""} · block ${pos.height ? pos.height.toLocaleString() : "—"}</div>
      <div class="split-kv"><span>Wallet</span><strong>${fmt(pos.wallet)}</strong></div>
      <div class="split-kv"><span>Staked</span><strong>${pos.contractCode ? fmt(pos.principal) : "n/a"}</strong></div>
      <div class="split-kv"><span>Yield</span><strong>${pos.contractCode ? fmt(pos.yieldAmt) : "n/a"}</strong></div>
      <div class="split-kv"><span>Unbonding</span><strong>${pos.contractCode ? fmt(pos.unbonding) : "n/a"}</strong></div>
      <div class="split-kv total"><span>Position</span><strong>${pos.contractCode ? fmt(total) : "0"}</strong></div>
      <p class="small text-secondary mb-0 mt-2">${note}</p>`;
  }
  function paintSplitView() {
    const pack = state.split;
    if (!pack) return;
    paintSplitCard($("splitPre"), "Before split", "history", pack.pre,
      "Last shared block 316,001. Staking contract did not exist yet. Native balance only.");
    paintSplitCard($("splitCom"), "After split · community", "live", pack.afterCommunity,
      "Canonical community book. Default unstake / claim target.");
    paintSplitCard($("splitDiv"), "After split · divergent", "compare", pack.afterDivergent,
      "rpc.bdagscan.com family. Compare only unless you point the wallet RPC there.");
    const com = pack.afterCommunity;
    const div = pack.afterDivergent;
    const pre = pack.pre;
    const el = $("splitTotals");
    if (el && com && com.ok) {
      const cPos = com.principal + com.yieldAmt + com.unbonding;
      const dPos = div && div.ok ? div.principal + div.yieldAmt + div.unbonding : 0n;
      el.innerHTML = `
        <div class="split-kv"><span>Pre-split wallet</span><strong>${pre && pre.ok ? fmt(pre.wallet) : "—"}</strong></div>
        <div class="split-kv"><span>Community wallet + position</span><strong>${fmt(com.wallet + cPos)}</strong></div>
        <div class="split-kv"><span>Divergent wallet + position</span><strong>${div && div.ok ? fmt(div.wallet + dPos) : "unavailable"}</strong></div>
        <p class="small text-secondary mb-0 mt-2">Do not add the two books. They are incompatible ledgers that reuse chain ID 1404.</p>`;
    }
    const hint = $("ledgerHint");
    if (hint && div && div.ok) {
      const dPos = div.principal + div.yieldAmt + div.unbonding;
      hint.textContent = dPos > 0n
        ? ("Divergent book shows " + fmt(dPos) + " BDAG in stake/yield/unbond. Unstaking there does not move the community book.")
        : "Divergent book answered. No position for this wallet + pool on that ledger.";
    }
  }
  async function loadAndPaintSplit() {
    if (!window.C1404_AUDIT) return;
    if (!$("splitPre") && !$("splitTotals") && document.body.getAttribute("data-page") !== "audit") return;
    const pack = await window.C1404_AUDIT.loadSplitPack(state.account, currentPool());
    state.split = pack;
    paintSplitView();
    paintAuditPage();
  }
  function paintAuditPage() {
    if (!$("auditPreview") || !window.C1404_AUDIT) return;
    if (!state.account) {
      $("auditPreview").textContent = "Connect a wallet, review the listed staking positions, choose one this session if you want a filtered report, then generate.";
      return;
    }
    const text = window.C1404_AUDIT.buildReport(state.split || { account: state.account, pool: currentPool() }, {
      account: state.account,
      pool: currentPool()
    });
    $("auditPreview").textContent = text;
  }
  function downloadAudit() {
    if (!window.C1404_AUDIT) return alert("Audit module failed to load.");
    if (!state.account) return alert("Connect a wallet first.");
    const pack = state.split || { account: state.account, pool: currentPool() };
    const text = window.C1404_AUDIT.buildReport(pack, { account: state.account, pool: currentPool() });
    const slug = (state.account || "wallet").slice(0, 10);
    window.C1404_AUDIT.downloadText("C1404-Staking-Audit-" + slug + "-" + new Date().toISOString().slice(0, 10) + ".txt", text);
  }
  async function simulateOn(url, data) {
    const r = await window.C1404_AUDIT.rpcCall(url, "eth_call", [{
      to: activeContract().proxy,
      from: state.account,
      data
    }, "latest"], 7000);
    return r;
  }
  async function doDivergentUnstake(data, amt) {
    if (!policyAccepted()) { showPolicyGate(); return alert("Accept the Policy and User Agreement first."); }
    if (!state.provider || !state.account) return alert("Connect a wallet first.");
    const endpoints = P.compareRpcs || [];
    if (!endpoints.length) return alert("No compare RPC configured.");
    let simOk = false, why = "";
    for (const n of endpoints) {
      try {
        await simulateOn(n.url, data);
        simOk = true;
        why = n.name;
        break;
      } catch (e) { why = e.message || "simulation failed"; }
    }
    const msg = [
      "This will ask your wallet to sign unstake(" + fmt(amt) + " BDAG) against the staking proxy.",
      "",
      "Both ledgers use chain ID 1404. The transaction lands on whichever RPC your wallet is using right now.",
      simOk
        ? ("Simulation against the divergent family succeeded (" + why + ").")
        : ("Simulation against the divergent family failed: " + sanitize(why) + "."),
      "",
      "If the wallet still points at a community RPC, the community book is what will change.",
      "Continue only if you have set the wallet RPC to rpc.bdagscan.com or rpc.blockdag.works on purpose."
    ].join("\\n");
    if (!confirm(msg.replace(/\\n/g, "\n"))) return;
    await sendTx("Unstake-divergent", data, 0n, fmt(amt) + " BDAG");
  }
  async function doDivergentClaim(data) {
    if (!policyAccepted()) { showPolicyGate(); return alert("Accept the Policy and User Agreement first."); }
    if (!state.provider || !state.account) return alert("Connect a wallet first.");
    if (!confirm("Claim will land on the RPC currently configured in your wallet. Continue only if that RPC is the ledger you intend.")) return;
    await sendTx("Claim-divergent", data, 0n, "claim");
  }


  function paintShell() {
    const page = document.body.getAttribute("data-page") || "home";
    applyTheme(localStorage.getItem(K.theme) || "dark");
    const header = $("shell");
    if (header && !header.dataset.ready) {
      header.dataset.ready = "1";
      header.innerHTML = `
        <nav class="topbar px-3 py-2">
          <div class="container-xl d-flex align-items-center justify-content-between gap-2">
            <a class="navbar-brand brand-mark mb-0" href="index.html">C1404 Wallet<small>Community BDAG · no custody</small></a>
            <div class="top-actions">
              <span id="status" class="pill wait">…</span>
              <button type="button" class="btn btn-sm btn-ghost" id="btnTheme" aria-label="Theme"><i class="fa-solid fa-sun"></i></button>
              <div class="wallet-cluster">
                <span id="walletSignal" class="sig sig-off"></span>
                <button type="button" class="btn btn-sm btn-accent" id="btnWallet"><i class="fa-solid fa-wallet me-1"></i>Connect</button>
                <button type="button" class="btn btn-sm btn-ghost d-none" id="btnDisconnect">Out</button>
              </div>
            </div>
          </div>
        </nav>
        <nav class="dock" aria-label="Wallet bar">
          <a class="${page === "home" ? "active" : ""}" href="index.html"><i class="fa-solid fa-house"></i>Home</a>
          <a class="${page === "stake" ? "active" : ""}" href="stake.html"><i class="fa-solid fa-lock"></i>Stake</a>
          <a class="${page === "claim" ? "active" : ""}" href="claim.html"><i class="fa-solid fa-coins"></i>Claim</a>
          <a class="${page === "donate" ? "active" : ""}" href="donate.html"><i class="fa-solid fa-heart"></i>Donate</a>
          <button type="button" id="btnMore"><i class="fa-solid fa-grip"></i>More</button>
        </nav>
        <div class="sheet" id="moreSheet">
          <div class="sheet-card">
            <div class="sheet-handle"></div>
            <div class="d-flex justify-content-between align-items-center mb-3">
              <strong>More</strong>
              <button type="button" class="btn btn-sm btn-ghost" id="btnMoreClose"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="sheet-grid">
              <a class="sheet-item" href="unstake.html"><i class="fa-solid fa-unlock"></i>Unstake</a>
              <a class="sheet-item" href="audit.html"><i class="fa-solid fa-file-lines"></i>Audit</a>
              <a class="sheet-item" href="insights.html"><i class="fa-solid fa-chart-pie"></i>Insights</a>
              <a class="sheet-item" href="log.html"><i class="fa-solid fa-comments"></i>Activity</a>
              <a class="sheet-item" href="contracts.html"><i class="fa-solid fa-file-code"></i>Contracts</a>
              <a class="sheet-item" href="guide.html"><i class="fa-solid fa-book"></i>Guide</a>
              <a class="sheet-item" href="safety.html"><i class="fa-solid fa-shield-halved"></i>Safety</a>
              <a class="sheet-item" href="policy.html"><i class="fa-solid fa-scale-balanced"></i>Policy</a>
              <a class="sheet-item" href="contact.html"><i class="fa-brands fa-telegram"></i>Contact</a>
              <a class="sheet-item" href="donate.html"><i class="fa-solid fa-heart"></i>Donate</a>
            </div>
            <div class="diag-box glass p-2 mt-3">
              <div class="d-flex justify-content-between small mb-1">
                <span>Diagnostics <span id="errCount">0</span></span>
                <button type="button" class="btn btn-sm btn-ghost" id="btnCopyErr">Copy</button>
              </div>
              <pre id="errBody">No errors yet.</pre>
            </div>
          </div>
        </div>`;
    }
    if (!$("walletModal")) {
      const m = document.createElement("div");
      m.innerHTML = `
        <div class="modal fade" id="walletModal" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content p-2">
              <div class="modal-header border-0">
                <h5 class="modal-title">Connect a wallet</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body" id="walletList"></div>
              <p class="small text-secondary px-3 pb-2 mb-0">By connecting you accept the <a href="policy.html">Policy and User Agreement</a>. Keys stay in the wallet.</p>
            </div>
          </div>
        </div>
        <div class="modal fade" id="policyModal" tabindex="-1" data-bs-backdrop="static">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content p-2">
              <div class="modal-header border-0">
                <h5 class="modal-title"><i class="fa-solid fa-scale-balanced me-2"></i>Policy gate</h5>
              </div>
              <div class="modal-body">
                <p class="mb-2">This is an unofficial community interface. It is not the BlockDAG company, not a custodian, not a broker, and not legal, tax, or investment advice.</p>
                <p class="small text-secondary">On-chain sends can fail, freeze, or wait weeks. You review every wallet prompt. Open <a href="policy.html">Policy and User Agreement</a> before you choose a position or send BDAG.</p>
              </div>
              <div class="modal-footer border-0">
                <a class="btn btn-ghost" href="policy.html">Read policy</a>
                <button type="button" class="btn btn-accent" id="btnAcceptPolicy">I understand and accept</button>
              </div>
            </div>
          </div>
        </div>
`;
      document.body.appendChild(m);
    }
    const foot = $("foot");
    if (foot) foot.innerHTML = `C1404 · unofficial community UI · <a href="policy.html">policy</a> · <a href="donate.html">donate</a> · <a href="contact.html">contact</a> · <a href="${P.kedge}">KEDGE</a>`;
    $("btnWallet")?.addEventListener("click", () => {
      if (state.account) {
        if (confirm("Disconnect this wallet from the UI?")) disconnectWallet();
        return;
      }
      showWalletModal();
    });
    $("btnDisconnect")?.addEventListener("click", disconnectWallet);
    const sheet = $("moreSheet");
    const openSheet = () => sheet && sheet.classList.add("open");
    const closeSheet = () => sheet && sheet.classList.remove("open");
    $("btnMore")?.addEventListener("click", openSheet);
    $("btnMoreClose")?.addEventListener("click", closeSheet);
    sheet?.addEventListener("click", (ev) => { if (ev.target === sheet) closeSheet(); });
    $("btnTheme")?.addEventListener("click", () => applyTheme(theme() === "dark" ? "light" : "dark"));
    $("btnStake")?.addEventListener("click", doStake);
    $("btnUnstake")?.addEventListener("click", doUnstake);
    $("btnClaim")?.addEventListener("click", doClaim);
    $("btnSearchContracts")?.addEventListener("click", () => searchContracts().catch((e) => pushErr(e.message)));
    $("btnMax")?.addEventListener("click", () => {
      const leave = 10n ** 16n;
      const use = state.pos.wallet > leave ? state.pos.wallet - leave : 0n;
      if ($("amount")) $("amount").value = fmt(use, 4).replace(/,/g, "");
    });
    $("btnClear")?.addEventListener("click", () => {
      if (confirm("Remove the activity log on this device?")) { localStorage.removeItem(K.log); renderLog(); }
    });
    $("btnAddContract")?.addEventListener("click", addUserContract);
    $("btnAudit")?.addEventListener("click", downloadAudit);
    $("btnAuditRefresh")?.addEventListener("click", () => loadAndPaintSplit().catch((e) => pushErr(e.message)));
    $("btnMaxUnstake")?.addEventListener("click", () => {
      if ($("amount")) $("amount").value = fmt(state.pos.principal, 6).replace(/,/g, "");
    });
    $("sendLedger")?.addEventListener("change", (ev) => { state.sendLedger = ev.target.value; });
    $("btnCopyErr")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("errBody").textContent || ""); } catch {}
    });
  }

  async function boot() {
    paintShell();
    $("btnAcceptPolicy")?.addEventListener("click", acceptPolicy);
    showPolicyGate();
    renderErr();
    startWaitClock();
    try { await silentReconnect(); } catch {}
    try { localStorage.removeItem(K.locked); } catch {}
    await refresh();
    if (!window.__c1404poll) {
      window.__c1404poll = setInterval(() => {
        window.__c1404quiet = true;
        refresh().finally(() => { window.__c1404quiet = false; }).catch(() => {});
      }, 12000);
    }
  }
  boot();
})();
