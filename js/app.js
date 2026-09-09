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
    active: "c1404.active.v1"
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
    rpcMs: []
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

  function savedPool() { return (localStorage.getItem(K.pool) || "").trim(); }
  function setPool(addr) { if (addr) localStorage.setItem(K.pool, addr); }
  function currentPool() {
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
    if (!good) throw new Error("No community connection answered.");
    state.rpc = good.n.url;
    state.rpcName = good.n.name;
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

  /* -------- wallets: EIP-6963 + injected + dapp browsers -------- */
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

  async function connectWith(entry) {
    const provider = entry.provider;
    const accs = await provider.request({ method: "eth_requestAccounts" });
    state.provider = provider;
    state.account = accs[0] || null;
    state.walletName = (entry.info && entry.info.name) || "Wallet";
    bindProvider(provider);
    await ensureChain();
    await refresh();
    hideWalletModal();
  }
  function bindProvider(provider) {
    if (!provider || !provider.on) return;
    provider.removeListener?.("accountsChanged", onAcc);
    provider.removeListener?.("chainChanged", onChain);
    provider.on("accountsChanged", onAcc);
    provider.on("chainChanged", onChain);
  }
  function onAcc(a) { state.account = (a && a[0]) || null; refresh(); }
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
    else if (el) el.classList.add("show"), el.style.display = "block";
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
    if (!btn) return;
    if (state.account) {
      btn.innerHTML = '<i class="fa-solid fa-wallet me-1"></i>' + short(state.account);
    } else {
      btn.innerHTML = '<i class="fa-solid fa-wallet me-1"></i>Connect';
    }
  }

  async function refresh() {
    try {
      setStatus("wait", "Checking…");
      await pickRpc();
      await safetyChecks();
      await Promise.all([readEpoch(), readFlags()]);
      if (state.migrate) setStatus("wait", "Review contract change");
      else if (!state.ready) setStatus("stop", state.reason || "Stopped");
      else setStatus("ok", "Network OK · " + state.rpcName);
      if ($("detail")) $("detail").textContent = state.reason || (
        state.account ? ("Connected via " + (state.walletName || "wallet") + ". Using " + state.rpcName + ".") : "Connect a wallet from the header to see your position."
      );
      if ($("epochLine")) {
        const ready = new Date((nowSec() + state.nextEpoch) * 1000);
        $("epochLine").textContent = "Week " + state.epoch + " · next week around " + ready.toLocaleString();
      }
      const pool = currentPool();
      state.pos = await position(pool);
      if ($("bal")) $("bal").textContent = fmt(state.pos.wallet);
      if ($("staked")) $("staked").textContent = fmt(state.pos.principal);
      if ($("rew")) $("rew").textContent = fmt(state.pos.yieldAmt);
      if ($("unbond")) $("unbond").textContent = fmt(state.pos.unbonding);
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
      if (state.account) {
        try { state.unbond = decodeUnbonding(await ethCall(P.sel.getUnbondingRequests + addrWord(state.account))); }
        catch { state.unbond = []; }
      }
      if ($("unbondList")) {
        const open = state.unbond.filter((r) => !r.isClaimed);
        $("unbondList").innerHTML = open.length
          ? open.map((r) => `<li>${fmt(r.amount)} BDAG · ready ${dateFromSec(Number(r.releaseTime))}</li>`).join("")
          : "<li>No open unstake requests.</li>";
      }
      if ($("riskLive")) {
        $("riskLive").textContent = state.restrictedPot
          ? "Payout destinations look restricted on-chain."
          : "Payout destinations are not locked. An upgraded implementation could send the pot elsewhere.";
      }
      renderContracts();
    } catch (err) {
      state.ready = false;
      state.reason = err.message || String(err);
      setStatus("stop", "Stop");
      if ($("detail")) $("detail").textContent = state.reason;
      pushErr(state.reason);
    }
    document.querySelectorAll("[data-need-ready]").forEach((btn) => {
      btn.disabled = !state.ready || !state.account || state.blocked || state.migrate;
    });
    paintWalletBtn();
    renderLog();
    drawCharts();
  }

  async function sendTx(action, data, valueWei, amountLabel) {
    if (!state.account || !state.provider) return alert("Connect a wallet first.");
    if (!state.ready || state.migrate) return alert(state.reason || "Network check failed.");
    if (state.blocked) return alert("This wallet looks frozen on enforcing nodes.");
    addLog({ action, amount: amountLabel, status: "pending", note: "Confirm in wallet" });
    try {
      const tx = { from: state.account, to: activeContract().proxy, data, value: "0x" + BigInt(valueWei || 0).toString(16) };
      const hash = await state.provider.request({ method: "eth_sendTransaction", params: [tx] });
      addLog({ action, amount: amountLabel, status: "pending", hash: hash ? hash.slice(0, 18) : "", note: "Waiting" });
      let rec = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        rec = await rpc("eth_getTransactionReceipt", [hash], 5000);
        if (rec) break;
      }
      const ok = rec && hexToBig(rec.status) === 1n;
      addLog({ action, amount: amountLabel, status: ok ? "done" : rec ? "failed" : "pending", hash: hash ? hash.slice(0, 18) : "", note: ok ? "Confirmed" : rec ? "Reverted" : "Still waiting" });
      await refresh();
    } catch (e) {
      const raw = e.message || String(e);
      const nice = /reject|denied|4001/i.test(raw) ? "You cancelled. Nothing moved." : sanitize(raw);
      addLog({ action, amount: amountLabel, status: "failed", note: nice });
      pushErr(nice);
      alert(nice);
    }
  }

  async function doStake() {
    const pool = currentPool();
    if (!isAddr(pool)) return alert("Paste the mining pool address first.");
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
    const pool = currentPool();
    if (!isAddr(pool)) return alert("Paste the mining pool address first.");
    setPool(pool);
    let amt;
    try { amt = parseAmount($("amount").value); } catch (e) { return alert(e.message); }
    const data = encodeUnstake(state.account, amt, [pool]);
    try { await rpc("eth_call", [{ to: activeContract().proxy, from: state.account, data }, "latest"]); }
    catch (e) { return alert("This unstake would fail: " + sanitize(e.message)); }
    await sendTx("Unstake", data, 0n, fmt(amt) + " BDAG");
  }
  async function doClaim() {
    const pool = currentPool();
    if (!isAddr(pool)) return alert("Paste the mining pool address first.");
    setPool(pool);
    const data = P.sel.claimStake + addrWord(state.account) + addrWord(pool);
    try { await rpc("eth_call", [{ to: activeContract().proxy, from: state.account, data }, "latest"]); }
    catch (e) { return alert("Claim is not allowed yet: " + sanitize(e.message)); }
    await sendTx("Claim", data, 0n, "claim");
  }

  /* -------- charts (canvas, no extra lib) -------- */
  function cssVar(name, fb) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
  }
  function doughnut(canvas, parts) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * 2 || 600;
    const h = canvas.height = 280;
    ctx.clearRect(0, 0, w, h);
    const total = parts.reduce((s, p) => s + p.v, 0) || 1;
    const cx = w * 0.32, cy = h / 2, r = Math.min(w, h) * 0.32;
    let a = -Math.PI / 2;
    parts.forEach((p) => {
      const sl = (p.v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, a + sl);
      ctx.closePath();
      ctx.fillStyle = p.c;
      ctx.fill();
      a += sl;
    });
    ctx.fillStyle = cssVar("--bg1", "#0b1a2e");
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.font = "22px sans-serif";
    ctx.fillStyle = cssVar("--text", "#fff");
    let ly = 40;
    parts.forEach((p) => {
      ctx.fillStyle = p.c;
      ctx.fillRect(w * 0.62, ly, 18, 18);
      ctx.fillStyle = cssVar("--text", "#fff");
      ctx.fillText(p.l + "  " + p.v.toFixed(2), w * 0.62 + 28, ly + 16);
      ly += 36;
    });
  }
  function bars(canvas, items) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * 2 || 600;
    const h = canvas.height = 280;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(1, ...items.map((i) => i.v));
    const gap = 16, bw = (w - gap * (items.length + 1)) / items.length;
    items.forEach((it, i) => {
      const x = gap + i * (bw + gap);
      const bh = (it.v / max) * (h - 70);
      ctx.fillStyle = it.c || cssVar("--accent", "#3ee0ff");
      ctx.fillRect(x, h - 40 - bh, bw, bh);
      ctx.fillStyle = cssVar("--muted", "#888");
      ctx.font = "20px sans-serif";
      ctx.fillText(it.l, x, h - 12);
    });
  }
  function line(canvas, pts) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * 2 || 600;
    const h = canvas.height = 280;
    ctx.clearRect(0, 0, w, h);
    if (!pts.length) return;
    const max = Math.max(1, ...pts);
    ctx.strokeStyle = cssVar("--accent", "#3ee0ff");
    ctx.lineWidth = 4;
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = (i / Math.max(1, pts.length - 1)) * (w - 40) + 20;
      const y = h - 30 - (v / max) * (h - 60);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  function drawCharts() {
    const w = Number(state.pos.wallet) / 1e18;
    const s = Number(state.pos.principal) / 1e18;
    const r = Number(state.pos.yieldAmt) / 1e18;
    const u = Number(state.pos.unbonding) / 1e18;
    doughnut($("chartMix"), [
      { l: "Wallet", v: w, c: "#3ee0ff" },
      { l: "Staked", v: s, c: "#7c5cff" },
      { l: "Rewards", v: r, c: "#3ee0a0" },
      { l: "Unbonding", v: u, c: "#ffc857" }
    ]);
    doughnut($("chartSplit"), [
      { l: "Miners", v: state.minerSplit, c: "#7c5cff" },
      { l: "Stakers", v: state.stakerSplit, c: "#3ee0ff" }
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
    const remain = Math.max(0, state.nextEpoch);
    line($("chartEpoch"), [P.constants.epochSeconds, Math.max(1, P.constants.epochSeconds - remain / 2), remain]);
    if ($("epochFill")) {
      const pct = Math.max(0, Math.min(100, 100 * (1 - remain / P.constants.epochSeconds)));
      $("epochFill").style.width = pct + "%";
    }
  }

  function renderContracts() {
    const box = $("contractList");
    if (!box) return;
    const acc = acceptedPins();
    box.innerHTML = allContracts().map((c) => {
      const on = activeContract().id === c.id;
      const live = on ? state.liveImpl : "";
      const expected = (acc[c.id] && acc[c.id].implementation) || c.implementation;
      const drift = live && expected && live.toLowerCase() !== expected.toLowerCase();
      return `<div class="glass p-3 mb-3">
        <div class="d-flex justify-content-between flex-wrap gap-2">
          <strong>${c.label}</strong>
          <span class="pill ${on ? "ok" : ""}">${on ? "Active" : "Saved"}</span>
        </div>
        <div class="addr mt-2">Proxy pin on file</div>
        <div class="small text-secondary">${c.note || ""} ${drift ? "· live logic differs from the pin" : ""}</div>
        <div class="mt-2 d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-accent" data-use="${c.id}">Use this contract</button>
          ${on && drift ? `<button class="btn btn-sm btn-ghost" data-accept="${c.id}">Accept live logic after review</button>` : ""}
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
    const proxy = ($("newProxy") && $("newProxy").value.trim()) || "";
    const impl = ($("newImpl") && $("newImpl").value.trim()) || "";
    const label = ($("newLabel") && $("newLabel").value.trim()) || "Migrated contract";
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
              <ul class="navbar-nav ms-auto align-items-lg-center gap-lg-1">
                <li class="nav-item"><a class="nav-link ${page === "home" ? "active" : ""}" href="index.html">Home</a></li>
                <li class="nav-item dropdown">
                  <a class="nav-link dropdown-toggle ${["stake","unstake","claim"].includes(page) ? "active" : ""}" href="#" data-bs-toggle="dropdown">Actions</a>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="stake.html"><i class="fa-solid fa-lock me-2"></i>Stake</a></li>
                    <li><a class="dropdown-item" href="unstake.html"><i class="fa-solid fa-unlock me-2"></i>Unstake</a></li>
                    <li><a class="dropdown-item" href="claim.html"><i class="fa-solid fa-coins me-2"></i>Claim</a></li>
                  </ul>
                </li>
                <li class="nav-item"><a class="nav-link ${page === "insights" ? "active" : ""}" href="insights.html">Insights</a></li>
                <li class="nav-item dropdown">
                  <a class="nav-link dropdown-toggle ${["log","contracts","guide","safety"].includes(page) ? "active" : ""}" href="#" data-bs-toggle="dropdown">More</a>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="log.html"><i class="fa-solid fa-list me-2"></i>Activity log</a></li>
                    <li><a class="dropdown-item" href="contracts.html"><i class="fa-solid fa-file-contract me-2"></i>Contracts</a></li>
                    <li><a class="dropdown-item" href="guide.html"><i class="fa-solid fa-circle-info me-2"></i>Guide</a></li>
                    <li><a class="dropdown-item" href="safety.html"><i class="fa-solid fa-shield-halved me-2"></i>Safety</a></li>
                  </ul>
                </li>
                <li class="nav-item ms-lg-2"><span id="status" class="pill wait">Checking…</span></li>
                <li class="nav-item"><button type="button" class="btn btn-sm btn-ghost theme-toggle" id="btnTheme"><i class="fa-solid fa-sun"></i></button></li>
                <li class="nav-item"><button type="button" class="btn btn-sm btn-accent" id="btnWallet"><i class="fa-solid fa-wallet me-1"></i>Connect</button></li>
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
              <p class="small text-secondary px-3 pb-3">Works with injected wallets and dapp browsers (MetaMask, Rabby, Trust, TokenPocket, SafePal, OKX, Bitget, Coinbase, Brave, Binance). Keys stay in the wallet.</p>
            </div>
          </div>
        </div>
        <div class="err-dock">
          <div class="glass p-2 px-3">
            <div class="d-flex justify-content-between align-items-center">
              <strong class="small"><i class="fa-solid fa-triangle-exclamation me-1"></i>Error log <span id="errCount" class="pill">0</span></strong>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-ghost" id="btnCopyErr">Copy</button>
                <button type="button" class="btn btn-sm btn-ghost" id="btnClearErr">Clear</button>
              </div>
            </div>
            <pre id="errBody">No errors yet.</pre>
          </div>
        </div>`;
      document.body.appendChild(m);
    }
    const foot = $("foot");
    if (foot) foot.innerHTML = `Chain-1404 Stake Manager · community UI · keys stay in your wallet · stuck send? <a href="${P.kedge}">KEDGE</a>`;
    const poolEl = $("pool");
    if (poolEl && savedPool() && !poolEl.value) poolEl.value = savedPool();
    $("btnWallet")?.addEventListener("click", showWalletModal);
    $("btnTheme")?.addEventListener("click", () => applyTheme(theme() === "dark" ? "light" : "dark"));
    $("btnStake")?.addEventListener("click", doStake);
    $("btnUnstake")?.addEventListener("click", doUnstake);
    $("btnClaim")?.addEventListener("click", doClaim);
    $("btnMax")?.addEventListener("click", async () => {
      if (!state.account) return;
      const leave = 2n * 10n ** 16n;
      const use = state.pos.wallet > leave ? state.pos.wallet - leave : 0n;
      if ($("amount")) $("amount").value = (Number(use) / 1e18).toFixed(4);
    });
    $("btnClear")?.addEventListener("click", () => {
      if (confirm("Remove the activity log on this device?")) { localStorage.removeItem(K.log); renderLog(); }
    });
    $("pool")?.addEventListener("change", () => { setPool($("pool").value.trim()); refresh(); });
    $("btnAddContract")?.addEventListener("click", addUserContract);
    $("btnCopyErr")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("errBody").textContent || "");
        $("btnCopyErr").textContent = "Copied";
        setTimeout(() => { $("btnCopyErr").textContent = "Copy"; }, 1200);
      } catch { alert("Copy failed"); }
    });
    $("btnClearErr")?.addEventListener("click", () => { localStorage.removeItem(K.err); renderErr(); });
    applyTheme(localStorage.getItem(K.theme) || "dark");
    renderErr();
  }

  window.C1404 = { refresh, state, P };
  paintShell();
  refresh();
})();
