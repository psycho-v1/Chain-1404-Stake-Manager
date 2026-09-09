# Chain-1404 Stake Manager

Unofficial community interface for BDAG staking on **community Chain 1404**.

This is not staking.blockdag.engineering.  
This is not a custodian.  
This is not the BlockDAG company.

Static pages. Your wallet signs. Community RPCs only. The UI stops sending if the pinned implementation, owner, or block `316002` hash does not match.

**Read [Policy and User Agreement](policy.html) before you connect or send.**

---

## What you can do

| Page | Purpose |
| --- | --- |
| Home | Connect, lock your mining pool, watch live balances |
| Stake / Unstake / Claim | Send the matching contract call from your wallet |
| Insights | Mix, week clock, unbonding bars, RPC latency |
| Activity log | Local history on this browser only |
| Contracts | Review live implementation / owner; add a migrated proxy |
| Guide / Safety | How the lock and wait clocks work |
| Donate | Optional gifts to the operator — not a stake |
| Contact | Telegram `@psycho_v1` for bugs and feature ideas |
| Policy | User agreement and risk notice |

---

## How to use

1. Open the site **inside a wallet browser** (or a desktop extension wallet) over HTTPS.
2. Accept the policy gate.
3. Tap **Connect**. Session stays until **Disconnect**.
4. Paste the **mining pool address you already use**, Search, then **Lock**.  
   Locking only the staking proxy will not show your rewards.
5. Stake, unstake, or claim from **Actions**. Buttons stay off until the lock and the contract allow the send.
6. First claim is about four weeks from first deposit. Unstake is about three weeks, then Claim.

If a send sticks, use [KEDGE](https://psycho-v1.github.io/kedge).

---

## Wallets

Header Connect uses EIP-6963 plus injected dapp browsers:

MetaMask, Rabby, Trust, TokenPocket, SafePal, OKX, Bitget, Coinbase, Brave, Binance.

The site never asks for a seed.

---

## Network pins

See `js/pins.js`.

- Chain ID `1404`
- Denied hosts include `bdagscan.com` and `blockdag.works`
- Community block hash at `316002` is pinned
- If live `implementation` or `owner()` drift from the pin, sends pause until you review **Contracts**

---

## What this UI cannot do

- Override an on-chain pause, freeze, or upgrade
- Guarantee yield, listing, or a refund
- Restore a lost seed
- Speak for BlockDAG the company

On-chain figures can be zero if the locked address is not the pool you actually staked with.

---

## Operator

Independent community helper.  
Telegram: [t.me/psycho_v1](https://t.me/psycho_v1)

Donations listed on `donate.html` are voluntary gifts. They are not shares and not staking receipts.

---

## License of expectations

Software and copy are provided as-is. Use at your own risk.  
Full terms: `policy.html`.
