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
    pulse: { balance: 0n, totalStake: 0n, delta: 0n }
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
      const n = Number(v) / 1e18;
      if (!Number.isFinite(n)) return "0";
      return n.toLocaleString(undefined, { maximumFractionDigits: digits });
    } catch { return "—"; }
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
      box.innerHTML = "<tr><td colspan='5'>No actions yet.</td></tr>";
      return;
    }
    box.innerHTML = rows.map((r) => `<tr>
      <td>${new Date(r.t).toLocaleString()}</td>
      <td>${r.action}</td>
      <td>${r.amount || "—"}</td>
      <td>${r.status}</td>
      <td>${r.hash ? r.hash.slice(0, 10) + "…" : "—"}<div class="small text-secondary">${r.note || ""}</div></td>
    </tr>`).join("");
  }

  function lockedContract() {
    try { return JSON.parse(localStorage.getItem(K.locked) || "null"); } catch { return null; }
  }
  function lockContract(row) {
    if (!row || !isAddr(row.address)) return;
    localStorage.setItem(K.locked, JSON.stringify({
      address: row.address.toLowerCase(),
      label: row.label || short(row.address),
      at: Date.now()
    }));
    setPool(row.address);
    refresh();
  }
  function unlockContract() {
    localStorage.removeItem(K.locked);
    refresh();
  }
  function savedPool() { return (localStorage.getItem(K.pool) || "").trim(); }
  function setPool(addr) { if (addr) localStorage.setItem(K.pool, addr); }
  function currentPool() {
    const locked = lockedContract();
    if (locked && isAddr(locked.address)) return locked.address;
    const el = $("pool");
    return ((el && el.value.trim()) || savedPool());
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
    if (!hex || hex === "0x" || hex.length < 66) return [];
    const raw = hex.slice(2);
    const offset = Number(BigInt("0x" + raw.slice(0, 64)));
    const start = offset * 2;
    const len = Number(BigInt("0x" + raw.slice(start, start + 64)));
    const rows = [];
    let p = start + 64;
    for (let i = 0; i < len && i < 80; i++) {
      const shares = BigInt("0x" + raw.slice(p, p + 64)); p += 64;
      const releaseTime = BigInt("0x" + raw.slice(p, p + 64)); p += 64;
      const pool = "0x" + raw.slice(p + 24, p + 64); p += 64;
      const isClaimed = BigInt("0x" + raw.slice(p, p + 64)) !== 0n; p += 64;
      const amount = BigInt("0x" + raw.slice(p, p + 64)); p += 64;
      rows.push({ shares, releaseTime, pool, isClaimed, amount });
    }
    return rows;
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
    if (!g.locked) return "Lock your mining pool address first";
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
    set("btnStake", g.canStake, !g.locked ? "Lock your mining pool address first" : "Wallet or network not ready");
    set("btnUnstake", g.canUnstake, !g.locked ? "Lock your mining pool address first" : "Nothing staked to unstake");
    set("btnClaim", g.canClaim, claimWhy(g));
    const badge = $("lockBadge");
    const line = $("lockedLine");
    if (badge) {
      badge.textContent = g.locked ? "Locked" : "Not locked";
      badge.className = "badge " + (g.locked ? "text-bg-success" : "text-bg-secondary");
    }
    if (line) {
      line.textContent = g.locked
        ? ("Locked " + (g.locked.label || short(g.locked.address)) + " · " + g.locked.address)
        : "Search your mining pool 0x (the pool you already stake with), then lock it before Stake, Unstake, or Claim.";
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
      else if (!g.locked) lab.textContent = "Lock your mining-pool address to read rewards.";
      else if (state.pos.yieldAmt === 0n && state.pos.unbonding === 0n && state.pos.principal === 0n)
        lab.textContent = "No position on the locked address. Paste the pool you already stake with, then Search → Lock.";
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
            ? "Lock is on. Connect and wait for a position if buttons stay off."
            : "Lock your mining pool address first.";
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
      if (!isAddr(addr)) return;
      const k = addr.toLowerCase();
      if (out.some((x) => x.address === k)) return;
      out.push({ address: k, label: label || short(addr) });
    };
    allContracts().forEach((c) => add(c.proxy, c.label));
    if (savedPool()) add(savedPool(), "Previously used");
    const locked = lockedContract();
    if (locked) add(locked.address, locked.label || "Locked");
    loadLog().forEach((r) => { if (r.pool) add(r.pool, "From your log"); });
    const q = ($("contractQuery") && $("contractQuery").value.trim()) || "";
    if (isAddr(q)) add(q, "Search");
    return out;
  }
  async function searchContracts() {
    const box = $("contractHits");
    if (!box) return;
    box.innerHTML = "<p class='small text-secondary'>Reading contracts…</p>";
    const q = (($("contractQuery") && $("contractQuery").value) || "").trim().toLowerCase();
    const found = [];
    for (const row of knownAddresses()) {
      if (q && !row.address.includes(q) && !(row.label || "").toLowerCase().includes(q)) continue;
      found.push({ ...row, ...(await inspectContract(row.address)) });
    }
    const engaged = found.filter((r) => r.engaged);
    const rest = found.filter((r) => !r.engaged);
    const locked = lockedContract();
    const card = (r) => {
      const isLocked = locked && locked.address === r.address;
      return `<div class="glass p-3 mb-2">
        <div class="d-flex justify-content-between gap-2 flex-wrap">
          <div>
            <div class="fw-semibold">${r.label || short(r.address)}</div>
            <div class="addr small">${r.address}</div>
            <div class="small text-secondary">
              ${r.engaged ? "You are in this contract" : "No position for this wallet"}
              · stake ${fmt(r.principal)} · rewards ${fmt(r.yieldAmt)} · unbonding ${fmt(r.unbonding)}
            </div>
          </div>
          <button type="button" class="btn btn-sm ${isLocked ? "btn-ghost" : "btn-accent"}" data-lock="${r.address}" ${isLocked ? "disabled" : ""}>
            ${isLocked ? "Locked" : "Lock to engage"}
          </button>
        </div>
      </div>`;
    };
    box.innerHTML =
      (engaged.length ? "<p class='small mb-2'>Contracts this wallet is in</p>" + engaged.map(card).join("") : "") +
      (rest.length ? "<p class='small mt-3 mb-2'>Other matches</p>" + rest.map(card).join("") : "") +
      (!found.length ? "<p class='small text-secondary'>No contract found. Paste a 0x address and search again.</p>" : "");
    box.querySelectorAll("[data-lock]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = found.find((r) => r.address === btn.getAttribute("data-lock"));
        if (row) lockContract(row);
      });
    });
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
    const total = parts.reduce((s, p) => s + p.v, 0) || 1;
    let a = -Math.PI / 2;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8;
    parts.forEach((p) => {
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
  function drawCharts() {
    const mix = [
      { v: Number(state.pos.wallet) / 1e18, c: "#3ee0ff" },
      { v: Number(state.pos.principal) / 1e18, c: "#7c5cff" },
      { v: Number(state.pos.yieldAmt) / 1e18, c: "#3ee0a0" },
      { v: Number(state.pos.unbonding) / 1e18, c: "#ffc857" }
    ];
    pie($("chartMix"), mix);
    const remain = state.nextEpoch || 0;
    const used = Math.max(0, P.constants.epochSeconds - remain);
    bars($("chartEpoch"), [
      { l: "used", v: used, c: "#3ee0ff" },
      { l: "left", v: remain, c: "#7c5cff" }
    ]);
    if ($("epochFill")) {
      const pct = Math.min(100, (used / P.constants.epochSeconds) * 100);
      $("epochFill").style.width = pct + "%";
    }
    pie($("chartSplit"), [
      { v: state.minerSplit, c: "#7c5cff" },
      { v: state.stakerSplit, c: "#3ee0a0" }
    ]);
    const days = {};
    loadLog().forEach((row) => {
      const d = new Date(row.t).toISOString().slice(5, 10);
      days[d] = (days[d] || 0) + 1;
    });
    const keys = Object.keys(days).slice(0, 10).reverse();
    bars($("chartActivity"), keys.map((k) => ({ l: k.slice(3), v: days[k], c: "#3ee0ff" })));
    const open = state.unbond.filter((x) => !x.isClaimed);
    bars($("chartUnbond"), open.slice(0, 8).map((x, i) => ({
      l: "R" + (i + 1),
      v: Number(x.amount) / 1e18,
      c: Number(x.releaseTime) <= nowSec() ? "#3ee0a0" : "#ffc857"
    })));
    bars($("chartRpc"), state.rpcMs.map((n) => ({
      l: n.name.split(" ")[0].slice(0, 6),
      v: n.ok ? Math.max(1, n.ms) : 0,
      c: n.ok ? "#3ee0a0" : "#ff6b81"
    })));
  }

  async function refresh() {
    try {
      setStatus("wait", "Checking…");
      await pickRpc();
      await safetyChecks();
      await Promise.all([readEpoch(), readFlags()]);
      if (state.migrate) setStatus("wait", "Review contract change");
      else if (!state.ready) setStatus("stop", state.reason || "Stopped");
      else if (state.rpcBad) setStatus("wait", "RPC warning");
      else setStatus("ok", "Network OK · " + state.rpcName);
      if ($("detail")) $("detail").textContent = state.reason || (
        state.account
          ? ("Connected via " + (state.walletName || "wallet") + ". Using " + state.rpcName + ".")
          : "Connect a wallet from the header to see your position."
      );
      if ($("epochLine")) {
        const ready = new Date((nowSec() + state.nextEpoch) * 1000);
        $("epochLine").textContent = "Week " + state.epoch + " · next week around " + ready.toLocaleString();
      }
      const pool = currentPool();
      state.pos = await position(pool);
      if (state.account) {
        try { state.unbond = decodeUnbonding(await ethCall(P.sel.getUnbondingRequests + addrWord(state.account))); }
        catch { state.unbond = []; }
      } else state.unbond = [];
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
    } catch (e) {
      state.ready = false;
      state.rpcBad = true;
      state.rpcWhy = e.message || "RPC failed";
      setStatus("stop", sanitize(e.message || "Stopped"));
      if ($("detail")) $("detail").textContent = sanitize(e.message || "Stopped");
      pushErr(e.message || "Refresh failed");
    }
    paintWalletBtn();
    paintActions();
    paintWait();
    renderLog();
    drawCharts();
    renderContracts();
  }

  async function sendTx(action, data, value, amountLabel) {
    if (!policyAccepted()) { showPolicyGate(); return alert("Accept the Policy and User Agreement first."); }
    if (!state.provider || !state.account) return alert("Connect a wallet first.");
    const g = gates();
    if (!g.locked) return alert("Lock your mining pool address first.");
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
    if (!isAddr(pool)) return alert("Lock your mining pool address first.");
    setPool(pool);
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
    const g = gates();
    if (!g.canUnstake) return alert("Unstake is not available yet.");
    const pool = currentPool();
    if (!isAddr(pool)) return alert("Lock your mining pool address first.");
    setPool(pool);
    let amt;
    try { amt = parseAmount($("amount").value); } catch (e) { return alert(e.message); }
    const data = encodeUnstake(state.account, amt, [pool]);
    try { await rpc("eth_call", [{ to: activeContract().proxy, from: state.account, data }, "latest"]); }
    catch (e) { return alert("This unstake would fail: " + sanitize(e.message)); }
    await sendTx("Unstake", data, 0n, fmt(amt) + " BDAG");
  }
  async function doClaim() {
    const g = gates();
    if (!g.canClaim) return alert(claimWhy(g));
    const pool = currentPool();
    if (!isAddr(pool)) return alert("Lock your mining pool address first.");
    setPool(pool);
    const data = P.sel.claimStake + addrWord(state.account) + addrWord(pool);
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

  function paintShell() {
    const page = document.body.getAttribute("data-page") || "home";
    applyTheme(localStorage.getItem(K.theme) || "dark");
    const header = $("shell");
    if (header && !header.dataset.ready) {
      header.dataset.ready = "1";
      header.innerHTML = `
        <nav class="navbar navbar-expand-lg topbar px-3">
          <div class="container-xl">
            <a class="navbar-brand brand-mark mb-0" href="index.html">Chain-1404 Stake Manager<small>Community BDAG · no custody</small></a>
            <button class="navbar-toggler btn-ghost" type="button" data-bs-toggle="collapse" data-bs-target="#navMain" aria-label="Menu">
              <i class="fa-solid fa-bars"></i>
            </button>
            <div class="collapse navbar-collapse" id="navMain">
              <ul class="navbar-nav ms-auto align-items-lg-center gap-1">
                <li class="nav-item"><a class="nav-link ${page === "home" ? "active" : ""}" href="index.html">Home</a></li>
                <li class="nav-item dropdown">
                  <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown">Actions</a>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><h6 class="dropdown-header">Actions</h6></li>
                    <li><a class="dropdown-item" href="stake.html"><i class="fa-solid fa-lock me-2"></i>Stake</a></li>
                    <li><a class="dropdown-item" href="unstake.html"><i class="fa-solid fa-unlock me-2"></i>Unstake</a></li>
                    <li><a class="dropdown-item" href="claim.html"><i class="fa-solid fa-coins me-2"></i>Claim</a></li>
                  </ul>
                </li>
                <li class="nav-item"><a class="nav-link ${page === "insights" ? "active" : ""}" href="insights.html">Insights</a></li>
                <li class="nav-item dropdown">
                  <a class="nav-link dropdown-toggle ${["log","contracts","guide","safety","donate","contact","policy"].includes(page) ? "active" : ""}" href="#" data-bs-toggle="dropdown">More</a>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><h6 class="dropdown-header">Workspace</h6></li>
                    <li><a class="dropdown-item" href="log.html"><i class="fa-solid fa-list me-2"></i>Activity log</a></li>
                    <li><a class="dropdown-item" href="contracts.html"><i class="fa-solid fa-file-code me-2"></i>Contracts</a></li>
                    <li><a class="dropdown-item" href="guide.html"><i class="fa-solid fa-book me-2"></i>Guide</a></li>
                    <li><a class="dropdown-item" href="safety.html"><i class="fa-solid fa-shield-halved me-2"></i>Safety</a></li>
                    <li><a class="dropdown-item" href="policy.html"><i class="fa-solid fa-scale-balanced me-2"></i>Policy</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><h6 class="dropdown-header">Operator</h6></li>
                    <li><a class="dropdown-item" href="donate.html"><i class="fa-solid fa-heart me-2"></i>Donate</a></li>
                    <li><a class="dropdown-item" href="contact.html"><i class="fa-brands fa-telegram me-2"></i>Contact</a></li>
                  </ul>
                </li>
                <li class="nav-item ms-lg-2"><span id="status" class="pill wait">Checking…</span></li>
                <li class="nav-item"><button type="button" class="btn btn-sm btn-ghost theme-toggle" id="btnTheme"><i class="fa-solid fa-sun"></i></button></li>
                <li class="nav-item">
                  <div class="wallet-cluster">
                    <span id="walletSignal" class="sig sig-off" title="Wallet"></span>
                    <span id="rpcWarn" class="sig-warn d-none" title="RPC not allowed"><i class="fa-solid fa-triangle-exclamation"></i></span>
                    <button type="button" class="btn btn-sm btn-accent" id="btnWallet"><i class="fa-solid fa-wallet me-1"></i>Connect</button>
                    <button type="button" class="btn btn-sm btn-ghost d-none" id="btnDisconnect">Disconnect</button>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </nav>`;
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
                <p class="small text-secondary">On-chain sends can fail, freeze, or wait weeks. You review every wallet prompt. Open <a href="policy.html">Policy and User Agreement</a> before you lock a pool or send BDAG.</p>
              </div>
              <div class="modal-footer border-0">
                <a class="btn btn-ghost" href="policy.html">Read policy</a>
                <button type="button" class="btn btn-accent" id="btnAcceptPolicy">I understand and accept</button>
              </div>
            </div>
          </div>
        </div>
        <div class="err-dock glass p-2">
          <div class="d-flex justify-content-between small">
            <span>Errors <span id="errCount">0</span></span>
            <button type="button" class="btn btn-sm btn-ghost" id="btnCopyErr">Copy</button>
          </div>
          <pre id="errBody">No errors yet.</pre>
        </div>`;
      document.body.appendChild(m);
    }
    const foot = $("foot");
    if (foot) foot.innerHTML = `C1404 · unofficial community UI · <a href="policy.html">policy</a> · <a href="donate.html">donate</a> · <a href="contact.html">contact</a> · <a href="${P.kedge}">KEDGE</a>`;
    $("btnWallet")?.addEventListener("click", () => {
      if (state.account) return;
      showWalletModal();
    });
    $("btnDisconnect")?.addEventListener("click", disconnectWallet);
    $("btnTheme")?.addEventListener("click", () => applyTheme(theme() === "dark" ? "light" : "dark"));
    $("btnStake")?.addEventListener("click", doStake);
    $("btnUnstake")?.addEventListener("click", doUnstake);
    $("btnClaim")?.addEventListener("click", doClaim);
    $("btnSearchContracts")?.addEventListener("click", () => searchContracts().catch((e) => pushErr(e.message)));
    $("btnMax")?.addEventListener("click", () => {
      const leave = 10n ** 16n;
      const use = state.pos.wallet > leave ? state.pos.wallet - leave : 0n;
      if ($("amount")) $("amount").value = (Number(use) / 1e18).toFixed(4);
    });
    $("btnClear")?.addEventListener("click", () => {
      if (confirm("Remove the activity log on this device?")) { localStorage.removeItem(K.log); renderLog(); }
    });
    $("btnAddContract")?.addEventListener("click", addUserContract);
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
    await refresh();
    if (lockedContract() || savedPool()) {
      try { await searchContracts(); } catch {}
    }
    if (!window.__c1404poll) {
      window.__c1404poll = setInterval(() => {
        refresh().catch((e) => pushErr(e.message || "live refresh"));
      }, 12000);
    }
  }
  boot();
})();
