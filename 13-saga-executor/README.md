# Saga Executor · Build 13

A recoverable, three-step token workflow for the [Pharos Agent Arena Saga Executor task](https://pharos-agent-arena.vercel.app/tasks/saga-executor).

**Live demo:** [pharos-agent-arena-builds.vercel.app/saga-executor](https://pharos-agent-arena-builds.vercel.app/saga-executor/)

**Network:** Pharos Atlantic Testnet · chain ID `688689`

**Token:** SGT, a valueless demo token

The agent approves SGT, locks it in an escrow contract, then deposits it into a test vault. It advances only after the previous transaction has a successful receipt and the expected contract state is confirmed. If the deposit is rejected, the agent refunds the escrow and revokes the token approval.

## Try the demo

Choose one scenario, set an amount, and select **Run demo**:

- **Complete the saga** — approve, lock, and deposit SGT; verify each receipt and the final vault credit.
- **Fail safely and recover** — enable the vault's controlled rejection. The executor catches `FORCED_REJECT` during preflight, before sending a failing deposit, then refunds and revokes.
- **Show failed receipt and recover** — opt into one controlled reverting deposit. The executor confirms a mined status-`0x0` receipt, refunds escrow, revokes approval, and checks the recovered balances. This mode is limited to `1 SGT`.

The UI also lets you inspect saved runs, transaction links, receipts, balance snapshots, and the full state log. Retry evidence is labeled simulated; it demonstrates transient-read backoff and duplicate-free reconciliation, not a claimed network outage.

> **Testnet notice:** Starting a run sends real transactions on Atlantic Testnet from the demo's server-side signer and spends its testnet gas. There is no browser wallet connection and no mainnet asset involved. The failed-receipt scenario intentionally mines a reverting transaction.

## Saga and recovery rules

```text
CREATED → APPROVAL_PENDING → APPROVED
        → LOCK_PENDING → LOCKED
        → DEPOSIT_PENDING → COMPLETED

Deposit rejection → COMPENSATING → RECOVERED
Unfinished recovery → RECOVERY_REQUIRED → resume and reconcile
```

For every state-changing step, the executor estimates gas, signs on the server, persists the expected transaction hash and nonce before broadcast, and waits for the receipt. It then reads the relevant contract state before allowing the next step. For example, it verifies the allowance after approval, the owner and amount after locking, and vault credit plus cleared allowance after deposit.

Read and transport failures retry at most three times with delays of `0`, `250`, and `750 ms`. A confirmed revert is permanent. A transaction submission is never blindly repeated: if the result is ambiguous or the receipt times out, the executor reconciles the saved hash, receipt, transaction, pending nonce, and current contract state. A pending operation can be resumed without duplicating it.

The Worker handles one state-changing saga step per request and saves progress in D1. The web UI resumes the saga across requests, so refreshes and interrupted runs can be reconciled. A D1 lock prevents concurrent execution of the same saga.

## Architecture

- `src/saga.js` — state machine, receipt gates, retry classification, and compensation.
- `src/chain.js` — Atlantic chain reads, local server-side signing, transaction submission, and receipt polling.
- `src/mcp-runtime.js` and `src/official-pharos-mcp/` — in-memory client/server transport using the official [Pharos Chain MCP](https://github.com/PharosNetwork/pharos-mcp) implementation with the Atlantic RPC.
- `src/store.js` and `migrations/` — persistent saga records, event logs, execution locks, and rate limits.
- `contracts/SagaDemo.sol` — valueless test token, saga escrow, and controlled test vault.
- `public/` — standalone Worker UI and retry evidence.
- `../showcase/saga-executor/` — the Pharos Builds version of the UI, styled to match the other builds.
- Root `vercel.json` — proxies `/saga-api/*` to the hosted Atlantic demo Worker so the browser can call it from the Pharos Builds page.

The deployed showcase currently uses the reference project's hosted Worker for execution and persistent D1 storage. This repository includes the Worker source as well, for inspection and independent deployment with your own Worker, D1 database, and signer secret.

## Contracts and chain evidence

All three contracts are deployed on Atlantic Testnet:

| Contract | Address | Deployment transaction |
| --- | --- | --- |
| Saga Test Token | `0x656BB1Bced876e304DCe2c8d98DDC9B1a08E928f` | [View deployment](https://atlantic.pharosscan.xyz/tx/0x0572b5a1b51dac7ee6db201f4acdb1c72af63f0c9c59d71c13a7e61fe26ce14a) |
| Saga Escrow | `0x8fFD7d13D2396BfdD9FBa98FCbDDb08d5475c820` | [View deployment](https://atlantic.pharosscan.xyz/tx/0x7472b7913b2fb5463f3803d88ddfdc7957ba724ba8ff6e9d55675b9a57758ee6) |
| Controlled Test Vault | `0x99CD6A4948F10bEf67c20203c012706d7336aa38` | [View deployment](https://atlantic.pharosscan.xyz/tx/0x97e13bdc634ccf10b3c55730516ed4703b518b560778452fcbb56c42fc465dfc) |

Recorded examples are included under [`evidence/`](evidence/). They are historical Atlantic snapshots, not a replay of the current chain state.

- [Successful approve](https://atlantic.pharosscan.xyz/tx/0xe65c6af1073b0b3be804118aa0391cb8c660c2c08e6540edba1464c7d79acf08), [lock](https://atlantic.pharosscan.xyz/tx/0xf311775e26ceb27ab5e3f226eb86f2c0d010e40c0d25859e23295e4bb83ad72d), and [deposit](https://atlantic.pharosscan.xyz/tx/0x46b54b978866b294dbc2b1c904bc4001861b1ba18de1f6b3cfc6d09da6297c5a) receipts all succeeded (`0x1`). The final state was `COMPLETED`.
- The receipt-verified failure example mined [a controlled failed deposit](https://atlantic.pharosscan.xyz/tx/0xf65e16b5e2e33df5c47d38590ea064544fd7cdec920d99d0bb1e5032c7a05804) with status `0x0`, then confirmed the [refund](https://atlantic.pharosscan.xyz/tx/0x2008168b4ff817b1ac9c7e54ee0ebd3679362fc62c6b38978f3ed5d70ca3918f) and [approval revoke](https://atlantic.pharosscan.xyz/tx/0xc648a3845687f3f28a00a255ca261633febadbc06d246fb5dd1777d0eb764bdc), both successful (`0x1`). The final state was `RECOVERED`; owner balance was restored, allowances were zero, escrow held no SGT, and vault credit was unchanged.
- [`retry-simulation.json`](evidence/retry-simulation.json) records the explicitly simulated retry scenario.

The escrow only accepts locks and deposits from its authorized executor. The original owner or executor can refund a locked saga. Saga IDs cannot be replayed; the vault credits the original owner and only accepts deposits from escrow.

## Run locally

Requires Node.js 20 or newer.

```bash
cd 13-saga-executor
npm install
npm run check
npm run build
```

To run the Cloudflare Worker locally, configure `.dev.vars` with `EXECUTOR_PRIVATE_KEY` for a dedicated Atlantic test signer, apply the D1 migration locally, and start Wrangler:

```bash
npx wrangler d1 migrations apply pharos-saga-executor-state --local
npm run dev
```

Never commit `.dev.vars` or a private key. Contract deployment is not part of the normal build; `npm run deploy:contracts` is a separate bootstrap command and must only be used with an intentional testnet deployment setup.

To invoke the same saga through the included CLI helper:

```bash
npm run skill -- --mode=success --amount=1
npm run skill -- --mode=failure --amount=1
npm run skill -- --mode=failure-broadcast --amount=1
npm run skill -- --resume=SAGA_ID
```

The installable agent instructions are in [`SKILL.md`](SKILL.md). See [`references/state-machine.md`](references/state-machine.md) for the compact transition and recovery rules.

## Demo limits

- Atlantic Testnet only; dedicated server signer and valueless SGT.
- Maximum normal demo amount: `10 SGT`; receipt-verified failure: `1 SGT` and a `250,000` gas limit.
- The hosted demo rate-limits each client to 20 saga steps per hour.
- This is a bounded demo workflow, not a generalized custody service. Recovery is persisted and resumable, but it still depends on the Atlantic RPC and hosted Worker being available.
