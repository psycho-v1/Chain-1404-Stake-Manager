/* Chain-1404 dual-ledger reader and holder audit pack. No custody. No secrets. */
(() => {
  const P = () => window.C1404_PINS;
  const hexToBig = (h) => {
    try { return BigInt(h || "0x0"); } catch { return 0n; }
  };
  const pad32 = (hex) => String(hex || "").replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const addrWord = (a) => pad32(a);
  const isAddr = (a) => /^0x[a-fA-F0-9]{40}$/.test(a || "");
  const short = (a) => (a && a.length > 10 ? a.slice(0, 6) + "…" + a.slice(-4) : (a || "—"));

  function fmt(wei, digits = 6) {
    try {
      const v = typeof wei === "bigint" ? wei : hexToBig(wei);
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

  async function rpcCall(url, method, params = [], ms = 6000) {
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
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || "RPC error");
      return { result: json.result, ms: Math.round(performance.now() - t0), url };
    } finally { clearTimeout(t); }
  }

  async function firstLive(list, method, params, ms) {
    let last = null;
    for (const n of list) {
      try {
        const r = await rpcCall(n.url, method, params, ms);
        return { ...r, name: n.name, family: n.family || "community" };
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error("No endpoint answered");
  }

  function emptyPos() {
    return {
      ok: false,
      why: "",
      height: 0,
      heightHex: "0x0",
      blockHash: "",
      stateRoot: "",
      rpcName: "",
      rpcUrl: "",
      wallet: 0n,
      nonce: 0,
      principal: 0n,
      yieldAmt: 0n,
      unbonding: 0n,
      first: 0n,
      pot: 0n,
      poolTotal: 0n,
      contractCode: false,
      blocked: false,
      owner: "",
      impl: "",
      unbond: [],
      capturedAt: new Date().toISOString()
    };
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

  async function readLedger(opts) {
    const pin = P();
    const out = emptyPos();
    const list = opts.endpoints || [];
    const tag = opts.blockTag || "latest";
    const account = opts.account;
    const pool = opts.pool;
    const proxy = (opts.proxy || (pin.contracts[0] && pin.contracts[0].proxy) || "").toLowerCase();
    try {
      const head = tag === "latest"
        ? await firstLive(list, "eth_blockNumber", [], 5000)
        : null;
      if (head) {
        out.height = Number(hexToBig(head.result));
        out.heightHex = head.result;
        out.rpcName = head.name;
        out.rpcUrl = head.url;
      }
      const blk = await firstLive(list, "eth_getBlockByNumber", [tag === "latest" ? (out.heightHex || "latest") : tag, false], 7000);
      out.rpcName = blk.name;
      out.rpcUrl = blk.url;
      out.blockHash = (blk.result && blk.result.hash) || "";
      out.stateRoot = (blk.result && blk.result.stateRoot) || "";
      out.height = Number(hexToBig(blk.result && blk.result.number));
      out.heightHex = (blk.result && blk.result.number) || tag;

      if (account && isAddr(account)) {
        const bal = await rpcCall(out.rpcUrl, "eth_getBalance", [account, tag], 5000);
        out.wallet = hexToBig(bal.result);
        const nonce = await rpcCall(out.rpcUrl, "eth_getTransactionCount", [account, tag], 5000);
        out.nonce = Number(hexToBig(nonce.result));
        try {
          const blkFlag = await rpcCall(out.rpcUrl, "eth_call", [{ to: pin.blocklist.full, data: pin.sel.isBlocked + addrWord(account) }, tag], 5000);
          out.blocked = hexToBig(blkFlag.result) !== 0n;
        } catch { out.blocked = false; }
      }

      try {
        const code = await rpcCall(out.rpcUrl, "eth_getCode", [proxy, tag], 5000);
        out.contractCode = !!(code.result && code.result !== "0x");
      } catch {
        out.contractCode = tag === "latest";
      }
      if (out.contractCode) {
        const pot = await rpcCall(out.rpcUrl, "eth_getBalance", [proxy, tag], 5000);
        out.pot = hexToBig(pot.result);
        try {
          const owner = await rpcCall(out.rpcUrl, "eth_call", [{ to: proxy, data: pin.sel.owner }, tag], 5000);
          out.owner = "0x" + String(owner.result || "").slice(-40);
        } catch {}
        try {
          const impl = await rpcCall(out.rpcUrl, "eth_getStorageAt", [proxy, pin.implSlot, tag], 5000);
          out.impl = "0x" + String(impl.result || "").slice(-40);
        } catch {}
        if (account && isAddr(account) && pool && isAddr(pool)) {
          const a = addrWord(account);
          const p = addrWord(pool);
          const [pr, un, yi, first, tot, req] = await Promise.all([
            rpcCall(out.rpcUrl, "eth_call", [{ to: proxy, data: pin.sel.stakerPrincipal + a + p }, tag], 5000).catch(() => ({ result: "0x0" })),
            rpcCall(out.rpcUrl, "eth_call", [{ to: proxy, data: pin.sel.stakerUnbonding + a + p }, tag], 5000).catch(() => ({ result: "0x0" })),
            rpcCall(out.rpcUrl, "eth_call", [{ to: proxy, data: pin.sel.poolStakerYield + p + a }, tag], 5000).catch(() => ({ result: "0x0" })),
            rpcCall(out.rpcUrl, "eth_call", [{ to: proxy, data: pin.sel.userFirstDeposit + a }, tag], 5000).catch(() => ({ result: "0x0" })),
            rpcCall(out.rpcUrl, "eth_call", [{ to: proxy, data: pin.sel.poolTotalStake + p }, tag], 5000).catch(() => ({ result: "0x0" })),
            rpcCall(out.rpcUrl, "eth_call", [{ to: proxy, data: pin.sel.getUnbondingRequests + a }, tag], 5000).catch(() => ({ result: "0x" }))
          ]);
          out.principal = hexToBig(pr.result);
          out.unbonding = hexToBig(un.result);
          out.yieldAmt = hexToBig(yi.result);
          out.first = hexToBig(first.result);
          out.poolTotal = hexToBig(tot.result);
          out.unbond = decodeUnbonding(req.result);
        }
      }
      out.ok = true;
    } catch (e) {
      out.ok = false;
      out.why = e.message || "read failed";
    }
    out.capturedAt = new Date().toISOString();
    return out;
  }

  async function loadSplitPack(account, pool) {
    const pin = P();
    const community = pin.rpcs.map((n) => ({ ...n, family: "community" }));
    const divergent = pin.compareRpcs || [];
    const pre = await readLedger({
      endpoints: community,
      blockTag: pin.fork.lastSharedHex,
      account,
      pool
    });
    const afterCommunity = await readLedger({
      endpoints: community,
      blockTag: "latest",
      account,
      pool
    });
    const afterDivergent = await readLedger({
      endpoints: divergent,
      blockTag: "latest",
      account,
      pool
    });
    return {
      account: account || "",
      pool: pool || "",
      proxy: pin.contracts[0].proxy,
      pre,
      afterCommunity,
      afterDivergent,
      loadedAt: new Date().toISOString()
    };
  }

  function line(label, value, width) {
    const l = String(label).padEnd(width || 28, " ");
    return l + "  " + String(value == null || value === "" ? "—" : value);
  }

  function posBlock(title, pos) {
    const rows = [];
    rows.push(title);
    rows.push("-".repeat(title.length));
    if (!pos || !pos.ok) {
      rows.push("  Status                  " + (pos && pos.why ? pos.why : "not loaded"));
      rows.push("");
      return rows.join("\n");
    }
    rows.push(line("  RPC", pos.rpcName + "  " + pos.rpcUrl));
    rows.push(line("  Captured (UTC)", pos.capturedAt));
    rows.push(line("  Height", pos.height ? pos.height.toLocaleString() : "—"));
    rows.push(line("  Block hash", pos.blockHash || "—"));
    rows.push(line("  State root", pos.stateRoot || "—"));
    rows.push(line("  Staking bytecode present", pos.contractCode ? "YES" : "NO"));
    rows.push(line("  Native wallet BDAG", fmt(pos.wallet, 8) + " BDAG"));
    rows.push(line("  Account nonce", String(pos.nonce)));
    rows.push(line("  Staked principal", fmt(pos.principal, 8) + " BDAG"));
    rows.push(line("  Accrued on-chain yield", fmt(pos.yieldAmt, 8) + " BDAG"));
    rows.push(line("  Unbonding / exit queue", fmt(pos.unbonding, 8) + " BDAG"));
    rows.push(line("  Position total", fmt(pos.principal + pos.yieldAmt + pos.unbonding, 8) + " BDAG"));
    rows.push(line("  Wallet + position", fmt(pos.wallet + pos.principal + pos.yieldAmt + pos.unbonding, 8) + " BDAG"));
    rows.push(line("  First deposit (unix)", pos.first ? String(pos.first) : "none recorded"));
    if (pos.first) {
      const unlock = Number(pos.first) + P().constants.bondingSeconds;
      rows.push(line("  First-claim clock ends", new Date(unlock * 1000).toISOString()));
    }
    rows.push(line("  Pool total stake", fmt(pos.poolTotal, 8) + " BDAG"));
    rows.push(line("  Staking pot balance", fmt(pos.pot, 8) + " BDAG"));
    rows.push(line("  Proxy owner()", pos.owner || "—"));
    rows.push(line("  ERC-1967 implementation", pos.impl || "—"));
    rows.push(line("  Address on full blocklist", pos.blocked ? "YES — sends may be rejected" : "no"));
    const open = (pos.unbond || []).filter((r) => !r.isClaimed);
    if (open.length) {
      rows.push("  Open unbonding requests:");
      open.forEach((r, i) => {
        const when = r.releaseTime ? new Date(Number(r.releaseTime) * 1000).toISOString() : "—";
        rows.push("    " + (i + 1) + ". " + fmt(r.amount, 8) + " BDAG  release " + when + "  pool " + r.pool);
      });
    } else {
      rows.push(line("  Open unbonding requests", "none"));
    }
    rows.push("");
    return rows.join("\n");
  }

  function buildReport(pack, extra) {
    const pin = P();
    const now = new Date();
    const account = (pack && pack.account) || (extra && extra.account) || "—";
    const pool = (pack && pack.pool) || (extra && extra.pool) || "—";
    const pre = pack && pack.pre;
    const com = pack && pack.afterCommunity;
    const div = pack && pack.afterDivergent;
    const comPos = com ? (com.principal + com.yieldAmt + com.unbonding) : 0n;
    const divPos = div && div.ok ? (div.principal + div.yieldAmt + div.unbonding) : 0n;
    const preWal = pre && pre.ok ? pre.wallet : 0n;
    const comWal = com && com.ok ? com.wallet : 0n;
    const divWal = div && div.ok ? div.wallet : 0n;

    const lines = [];
    lines.push("================================================================================");
    lines.push("CHAIN 1404 — HOLDER STAKING POSITION AUDIT");
    lines.push("Community technical record  ·  not a court finding  ·  not investment advice");
    lines.push("================================================================================");
    lines.push("");
    lines.push(line("Document"));
    lines.push(line("  Title", "Staking Position and Network-Event Audit"));
    lines.push(line("  Reference", "C1404-STAKE-" + now.toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(account).slice(2, 8).toUpperCase()));
    lines.push(line("  Prepared", now.toISOString()));
    lines.push(line("  Prepared by", "Holder, using the unofficial Chain-1404 Stake Manager"));
    lines.push(line("  Classification", "Technical / evidentiary working paper"));
    lines.push(line("  Audience", "Holder, miners, exchanges, wallet providers, counsel"));
    lines.push("");
    lines.push("1.  SCOPE AND EVIDENCE STANDARD");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("This record reports what an independent reader can reproduce from JSON-RPC");
    lines.push("calls against named endpoints, at named block tags, for one EVM address and");
    lines.push("one mining-pool address. It applies the same rule used in the 24 August 2026");
    lines.push("community evidence report: code and repeatable chain state outrank labels,");
    lines.push("screenshots, inference and motive claims.");
    lines.push("");
    lines.push("Findings inside this file are labelled as follows:");
    lines.push("  Verified              reproduced from an RPC response in this session");
    lines.push("  Supported             consistent with published community technical papers");
    lines.push("  Context               network history the holder needs in order to read the");
    lines.push("                        numbers; not a finding about this wallet");
    lines.push("  Limitation            the method cannot answer the question from public RPC");
    lines.push("");
    lines.push("This document is not legal advice, not a MiCA filing, not a proof of beneficial");
    lines.push("ownership, and not a representation that either ledger will be accepted by an");
    lines.push("exchange. A shared chain ID (1404 / 0x57c) does not make two histories one");
    lines.push("network.");
    lines.push("");
    lines.push("2.  SUBJECT IDENTIFIERS");
    lines.push("--------------------------------------------------------------------------------");
    lines.push(line("  Subject wallet", account));
    lines.push(line("  Mining pool selected", pool));
    lines.push(line("  Staking proxy", pin.contracts[0].proxy));
    lines.push(line("  Pinned implementation", pin.contracts[0].implementation));
    lines.push(line("  Pinned staking owner", pin.contracts[0].owner));
    lines.push(line("  Full blocklist", pin.blocklist.full));
    lines.push(line("  Selective blocklist", pin.blocklist.selective));
    lines.push(line("  Chain ID", String(pin.chainId) + " (" + pin.chainIdHex + ")"));
    lines.push("");
    lines.push("3.  NETWORK CONTEXT THE HOLDER MUST KNOW");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("Context.  On 11 February 2026, between 08:07 and 08:28 UTC, the five genesis");
    lines.push("wallets that held the entire 100,000,000,000 BDAG launch allocation each sent a");
    lines.push("50-BDAG test payment and then the main balance into five consolidation wallets.");
    lines.push("That sequence is a fixed point on both later histories.");
    lines.push("");
    lines.push("Verified (network).  The two visible histories share genesis and block 316,001.");
    lines.push("They diverge at EVM block 316,002 on 17 February 2026 at 22:03:01 UTC. The");
    lines.push("community pin for that block hash is:");
    lines.push("  " + pin.fork.community316002);
    lines.push("The split is not 'hash only'. Published technical review records different");
    lines.push("state roots at the same height, which means the two ledgers committed to");
    lines.push("different world state from that block forward.");
    lines.push("");
    lines.push("Context.  A later operational isolation of rpc.bdagscan.com is reconstructed");
    lines.push("around 15 July 2026, 15:28 UTC, near EVM block 14,394,144. Community papers");
    lines.push("treat the February height as the first EVM-state divergence and the July height");
    lines.push("as the point after which the two RPC families stopped tracking the same live");
    lines.push("DAG activity. An EVM height alone is not a complete native BlockDAG ancestry.");
    lines.push("");
    lines.push("Context.  The live staking UUPS proxy was deployed after the February split");
    lines.push("(community papers place the blocklist deployment near block 10,755,967 in");
    lines.push("mid-June 2026, with staking in the same post-split era). Therefore a read at");
    lines.push("block 316,001 will normally show native wallet balance only. It will not show");
    lines.push("a staking principal, because the staking contract did not exist at the last");
    lines.push("shared block. 'Before split' in this audit means the last shared native state.");
    lines.push("'After split' means each live ledger as it stands today.");
    lines.push("");
    lines.push("Supported.  Day-to-day list membership on the full and selective blocklists is");
    lines.push("administered by an EOA. Miners adopted the enforcing software through a");
    lines.push("signalled upgrade (observed window 1,514 of 2,000 blocks, 75% threshold).");
    lines.push("The blocklist owner can immobilise a listed address. The reviewed ABI does not");
    lines.push("give that owner a function to transfer, seize, redirect or spend another");
    lines.push("address's BDAG. Immobilisation is not confiscation.");
    lines.push("");
    lines.push("Supported.  The staking owner is a separate EOA from the blocklist owner. The");
    lines.push("reviewed ABI has no owner sweep of the pot. The same owner can pause the");
    lines.push("contract and authorise a UUPS upgrade, which is why this UI pauses sends if");
    lines.push("the live implementation or owner() drifts from the pin.");
    lines.push("");
    lines.push("4.  POSITION BEFORE THE SPLIT  (block 316,001 — last shared history)");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("Checkpoint: EVM block " + pin.fork.lastShared + " (" + pin.fork.lastSharedHex + ")");
    lines.push("Timestamp of first divergent sibling: " + pin.fork.splitUtc);
    lines.push("");
    lines.push(posBlock("Last shared state", pre));
    if (pre && pre.ok && !pre.contractCode) {
      lines.push("Finding (Verified).  No staking bytecode at the proxy address at block");
      lines.push("316,001. Staking figures at this checkpoint are therefore zero by construction,");
      lines.push("not because this wallet unstaked. Only the native balance and nonce are");
      lines.push("meaningful 'before-split' holdings.");
      lines.push("");
    }
    lines.push("5.  POSITION AFTER THE SPLIT — COMMUNITY HISTORY");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("This is the history corroborated by independent community RPCs and pinned by");
    lines.push("block 316,002 hash in this UI. Sends from this interface default to this ledger.");
    lines.push("");
    lines.push(posBlock("Community live state", com));
    lines.push("6.  POSITION AFTER THE SPLIT — DIVERGENT / OFFICIAL-LABELLED HISTORY");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("This is the history served by rpc.bdagscan.com / rpc.blockdag.works. Community");
    lines.push("papers describe it as lagging, checkpoint-incompatible after block 316,002, and");
    lines.push("operationally isolated. A number printed here is a database entry on that");
    lines.push("ledger. It does not become community-mainnet BDAG without consensus on the");
    lines.push("community history.");
    lines.push("");
    lines.push(posBlock("Divergent live state", div));
    lines.push("7.  COMBINED PRESENTATION  (do not treat as one spendable balance)");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("The two post-split columns are incompatible ledgers. Adding them does not");
    lines.push("create a larger claim on a single chain. The combined line is shown only so the");
    lines.push("holder can see both books in one place.");
    lines.push("");
    lines.push(line("  Before split — native wallet", fmt(preWal, 8) + " BDAG"));
    lines.push(line("  Before split — staking", "0  (contract not deployed)"));
    lines.push(line("  Community — native wallet", fmt(comWal, 8) + " BDAG"));
    lines.push(line("  Community — staked", fmt(com && com.principal || 0n, 8) + " BDAG"));
    lines.push(line("  Community — yield", fmt(com && com.yieldAmt || 0n, 8) + " BDAG"));
    lines.push(line("  Community — unbonding", fmt(com && com.unbonding || 0n, 8) + " BDAG"));
    lines.push(line("  Community — position subtotal", fmt(comPos, 8) + " BDAG"));
    lines.push(line("  Community — wallet + position", fmt(comWal + comPos, 8) + " BDAG"));
    lines.push(line("  Divergent — native wallet", div && div.ok ? fmt(divWal, 8) + " BDAG" : "unavailable"));
    lines.push(line("  Divergent — staked", div && div.ok ? fmt(div.principal, 8) + " BDAG" : "unavailable"));
    lines.push(line("  Divergent — yield", div && div.ok ? fmt(div.yieldAmt, 8) + " BDAG" : "unavailable"));
    lines.push(line("  Divergent — unbonding", div && div.ok ? fmt(div.unbonding, 8) + " BDAG" : "unavailable"));
    lines.push(line("  Divergent — position subtotal", div && div.ok ? fmt(divPos, 8) + " BDAG" : "unavailable"));
    lines.push(line("  Divergent — wallet + position", div && div.ok ? fmt(divWal + divPos, 8) + " BDAG" : "unavailable"));
    lines.push("");
    lines.push("  Side-by-side exposure (NOT a single-chain total):");
    lines.push(line("    Community book", fmt(comWal + comPos, 8) + " BDAG"));
    lines.push(line("    Divergent book", div && div.ok ? fmt(divWal + divPos, 8) + " BDAG" : "unavailable"));
    lines.push("");
    lines.push("8.  WHAT THE HOLDER CAN AND CANNOT DO FROM HERE");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("Verified (method).  Unstake and claim are ordinary calls on the staking proxy:");
    lines.push("  unstake(staker, amount, pools[])     selector " + pin.sel.unstake);
    lines.push("  claimStake(staker, pool)             selector " + pin.sel.claimStake);
    lines.push("The private key of the subject wallet must sign. The UI never holds coins.");
    lines.push("");
    lines.push("Limitation.  Both histories reuse chain ID 1404. A wallet extension stores one");
    lines.push("RPC per chain ID. A send lands on whichever RPC that wallet is actually using.");
    lines.push("To unstake on the community history, the wallet RPC must be a community");
    lines.push("endpoint whose block 316,002 hash matches the pin. To attempt an unstake on");
    lines.push("the divergent history, the wallet RPC must be pointed at that family first.");
    lines.push("This UI will not silently switch the wallet onto a denied host.");
    lines.push("");
    lines.push("Limitation.  There is no function that unstakes 'before the split'. Block");
    lines.push("316,001 is historical. Coins that exist only as a pre-split native balance are");
    lines.push("already in the wallet on both later books until later transactions moved them.");
    lines.push("");
    lines.push("Supported.  First claim waits about four weeks from first deposit. Unstake");
    lines.push("waits about three weeks, then claim. Adding more while an unstake is open can");
    lines.push("restart a wait. A listed address can have its send rejected at mempool,");
    lines.push("block-build and validation.");
    lines.push("");
    lines.push("9.  CONTROL PLANE THAT AFFECTS THIS STAKE");
    lines.push("--------------------------------------------------------------------------------");
    lines.push(line("  Staking proxy", pin.contracts[0].proxy));
    lines.push(line("  Community owner() now", (com && com.owner) || "—"));
    lines.push(line("  Community implementation", (com && com.impl) || "—"));
    lines.push(line("  Divergent owner() now", (div && div.owner) || "—"));
    lines.push(line("  Subject blocked (community)", com && com.blocked ? "YES" : "no"));
    lines.push(line("  Subject blocked (divergent)", div && div.ok ? (div.blocked ? "YES" : "no") : "unavailable"));
    lines.push("");
    lines.push("Context.  Community papers record an issued-supply picture near block");
    lines.push("18,955,000 of about 104.698 billion BDAG gross, of which about 26.972 billion");
    lines.push("sat in fully frozen wallets, leaving about 77.727 billion effective before");
    lines.push("other locks. Frozen balances are economically excluded while miners enforce");
    lines.push("the list; they are not an irreversible protocol burn unless a later consensus");
    lines.push("change makes them so.");
    lines.push("");
    lines.push("10. HOLDER STANDING — HOW TO READ THESE NUMBERS");
    lines.push("--------------------------------------------------------------------------------");
    if (com && com.ok && comPos > 0n) {
      lines.push("Verified.  This wallet has a live staking position on the community history.");
      lines.push("Unstake and claim against a community RPC act on that position only.");
    } else if (com && com.ok) {
      lines.push("Verified.  No staking principal, yield or unbonding was returned for this");
      lines.push("wallet and pool on the community history at the captured head. If the holder");
      lines.push("believes they staked, the usual causes are: wrong pool address selected; the");
      lines.push("position lives on another pool; the stake was recorded only on the divergent");
      lines.push("book; or the RPC has not yet answered a later state.");
    } else {
      lines.push("Limitation.  Community history could not be read in this session.");
    }
    lines.push("");
    if (div && div.ok && divPos > 0n) {
      lines.push("Verified.  The divergent RPC family also returns a staking position for this");
      lines.push("wallet and pool. That entry is not automatically the same coins as the");
      lines.push("community position. Do not unstake on one book expecting the other book to");
      lines.push("change.");
    } else if (div && div.ok) {
      lines.push("Verified.  The divergent RPC family answered and returned no position for");
      lines.push("this wallet and pool.");
    } else {
      lines.push("Limitation.  The divergent RPC family did not answer. Community papers have");
      lines.push("recorded intermittent backend-balancer failures on rpc.bdagscan.com.");
    }
    lines.push("");
    lines.push("11. RECOMMENDED NEXT ACTIONS");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("  1. Keep this file, the UTC stamp, the block hashes and the RPC URLs.");
    lines.push("  2. Confirm the wallet RPC against two community endpoints before any send.");
    lines.push("  3. Select the mining pool actually used for the original stake, not only the");
    lines.push("     staking proxy address.");
    lines.push("  4. If unstaking on community history: use Unstake in this UI, wait the");
    lines.push("     contract clock, then Claim.");
    lines.push("  5. If a position exists only on the divergent book: changing the wallet RPC");
    lines.push("     is a manual, informed act. This UI will simulate against that family on");
    lines.push("     request but will not treat that book as community mainnet.");
    lines.push("  6. If the address is listed on the full blocklist, a send will fail on");
    lines.push("     compliant nodes until the list entry is removed.");
    lines.push("  7. Exchanges should pin genesis, block 316,002 and a recent community");
    lines.push("     checkpoint — not chain ID alone.");
    lines.push("");
    lines.push("12. METHOD OF REPRODUCTION");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("  eth_chainId");
    lines.push("  eth_blockNumber");
    lines.push("  eth_getBlockByNumber(0x4d261, false)     last shared");
    lines.push("  eth_getBlockByNumber(0x4d262, false)     first divergent");
    lines.push("  eth_getBalance(wallet, tag)");
    lines.push("  eth_getTransactionCount(wallet, tag)");
    lines.push("  eth_getCode(stakingProxy, tag)");
    lines.push("  eth_call stakerPrincipal / poolStakerYield / stakerUnbonding /");
    lines.push("           userFirstDeposit / getUnbondingRequests / poolTotalStake");
    lines.push("  eth_call isBlocked(wallet) on the full blocklist");
    lines.push("  eth_getStorageAt(proxy, EIP-1967 implementation slot)");
    lines.push("");
    lines.push("Community endpoints used by this UI:");
    pin.rpcs.forEach((n) => lines.push("  - " + n.name + "  " + n.url));
    lines.push("Compare-only endpoints (not used for default sends):");
    (pin.compareRpcs || []).forEach((n) => lines.push("  - " + n.name + "  " + n.url));
    lines.push("");
    lines.push("13. SOURCES RELIED ON FOR NETWORK CONTEXT");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("  - Chain 1404 Evidence-Based Community Report, public draft, 24 August 2026");
    lines.push("  - Chain 1404 Factual Response to Technical Evidence Dossier, 26 August 2026");
    lines.push("  - Chain 1404 Technical Evidence Dossier v4 (Dawie), 25 August 2026");
    lines.push("  - Community Technical Incident Report: Reconstruction of the Divergent");
    lines.push("    BlockDAG Network");
    lines.push("  - BDAG Community AMA transcripts, 18 August, 27 August and 4 September 2026");
    lines.push("Those papers are context. The numbers in sections 4–7 are from this session's");
    lines.push("RPC replies.");
    lines.push("");
    lines.push("14. LIMITATIONS AND RESERVATIONS");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("  - Hosted RPCs can change after the capture time printed above.");
    lines.push("  - A producer address is not a proven natural person.");
    lines.push("  - An EOA is not cryptographic proof of one-person key custody.");
    lines.push("  - Pool contracts and off-chain pool books may hold a share this ABI does");
    lines.push("    not decode. If rewards stay at zero, the selected address is usually the");
    lines.push("    pool, not the staking proxy.");
    lines.push("  - This UI cannot override an on-chain pause, freeze or upgrade.");
    lines.push("  - No APY is computed or promised. Live bars are contract clocks.");
    lines.push("");
    lines.push("15. SIGN-OFF BLOCK  (holder may complete by hand)");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("  I confirm that I generated this file from my own wallet session and that I");
    lines.push("  have not been asked to deposit a seed phrase, private key or password into");
    lines.push("  this interface.");
    lines.push("");
    lines.push("  Wallet:     " + account);
    lines.push("  Date (UTC): " + now.toISOString());
    lines.push("  Signature / handwritten name: ________________________________");
    lines.push("");
    lines.push("END OF RECORD");
    lines.push("================================================================================");
    return lines.join("\n");
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.C1404_AUDIT = {
    fmt,
    loadSplitPack,
    readLedger,
    buildReport,
    downloadText,
    rpcCall,
    firstLive,
    hexToBig,
    decodeUnbonding
  };
})();
