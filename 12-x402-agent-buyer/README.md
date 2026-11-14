# x402 Agent Buyer

A small server-side agent that buys two live data resources from an x402-protected Pharos service. It reads each HTTP 402 quote, checks the price against a run budget, pays with Atlantic test USDC, and verifies the seller's receipt on chain. The page does not ask visitors to connect a browser wallet.

**Live demo:** [Open the buyer](https://pharos-agent-arena-builds.vercel.app/x402-agent-buyer/)

## What happens in a run

1. The page sends a scenario and its USDC limits to the buyer API.
2. The API reads the seller's live status and requests the first resource. The seller responds with an x402 `PAYMENT-REQUIRED` quote.
3. Before signing, the server checks the x402 version, network, USDC contract, merchant, resource URL, published route price, per-call cap, and remaining run budget.
4. The server agent signs an EIP-3009 `TransferWithAuthorization` with its dedicated burner key. The seller's facilitator submits it; the payer's test USDC goes to the seller.
5. If the response is lost, the buyer retries the same signed authorization. It does not create a new signature for the same payment attempt.
6. The buyer decodes `PAYMENT-RESPONSE`, fetches the Atlantic receipt, and checks for the exact USDC `Transfer` before showing a payment as confirmed.

The API used by this build is [pharos-x402-paywalled-api](https://github.com/shoupeorg/pharos-x402-paywalled-api). The buyer checks its live status before a run; the seller's availability can change.

## Resources and prices

| Resource | Price | Data returned |
| --- | ---: | --- |
| `/paid/network-snapshot` | `0.001 USDC` | A pinned Pharos block, base fee, and token balance data |
| `/paid/activity-summary` | `0.002 USDC` | Transaction counts and gas use over a three-block window |

The token is Pharos Atlantic test USDC at `0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B` (6 decimals). Receipts are checked against this token, the agent address, merchant address, and exact amount.

The buyer page also includes an editable **Pharos wallet to inspect** field. It defaults to the seller API's public demo buyer address (`0x29946933492Ca11744941Bc12630852498dAd8D7`), which opens on PharosScan. A run reads that address's PHRS and test-USDC balances at the current block. Judges can enter any other valid Atlantic address; this lookup is read-only and does not change the server-side payer or add a paid API call.

## Scenarios and limits

- **Complete the brief:** default run budget `0.005 USDC`; per-call cap `0.002 USDC`. The two current resources cost `0.003 USDC` total.
- **Stop at the budget:** default run budget `0.001 USDC`; per-call cap `0.002 USDC`. The first resource can be purchased; the second quote is refused because it would exceed the remaining budget.

The API enforces a maximum of `0.005 USDC` per run and `0.002 USDC` per call, regardless of values sent by the page. A price equal to a limit is allowed; a price above it is refused. Starting a run can spend test USDC without a wallet popup, so the page states the limits before the button.

The demo endpoint also has a best-effort limit of three runs per source IP per hour. That counter is in memory and can reset when serverless instances restart or scale; it is not a durable global spending quota. Use a dedicated burner funded only with test tokens, and do not put valuable assets in it. The server wallet is only for Pharos Atlantic testnet.

## Server wallet setup

The private key must stay in a server environment variable named `AGENT_PRIVATE_KEY`. Never add it to source, a committed `.env` file, page JavaScript, or a message. The public address is shown by `/api/config` for balance checks and testnet faucet funding. Visitors do not connect their own wallet.

To run locally, provide `AGENT_PRIVATE_KEY` in your local environment and start Vercel Dev:

```sh
cd 12-x402-agent-buyer
npx vercel dev
```

The seller pays transaction gas through its facilitator. The burner needs Atlantic test USDC to pay for resources. If it has no balance, the run stops before making a payment.

## Project files

- `public/index.html` — buyer interface, limits, run history, and receipt links.
- `api/agent.mjs` — quote validation, budget checks, x402 signing, safe retry, and receipt verification.
- `api/upstream.mjs` — seller status and narrow read-only proxy helpers.
- `api/config.mjs` — public seller and agent readiness status; never returns the private key.

## Boundaries

This is a Pharos Atlantic testnet build, not a mainnet payment product. The buyer verifies the settlement receipt, but depends on the third-party seller and facilitator for uptime. The browser ledger is local to that browser; it stores decision details and transaction hashes, never signatures or the private key. If settlement is returned but the receipt is not yet visible, the buyer reports an error/pending state instead of making a replacement payment.

## Links

- [Live demo](https://pharos-agent-arena-builds.vercel.app/x402-agent-buyer/)
- [Source folder](https://github.com/rajdeblol/pharos-agent-arena-builds/tree/main/12-x402-agent-buyer)
- [Seller API source](https://github.com/shoupeorg/pharos-x402-paywalled-api)
- [Arena task](https://pharos-agent-arena.vercel.app/tasks/x402-agent-buyer)
- [Pharos x402 docs](https://docs.pharos.xyz/developer-guide/x402)
