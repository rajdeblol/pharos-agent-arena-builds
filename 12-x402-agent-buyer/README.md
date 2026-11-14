# x402 Agent Buyer

A small Pharos-themed demo of an agent buying data only after it reads the price and checks its limits. The agent requests two paid resources, can combine them into a short RWA brief, records each payment decision, and refuses a purchase that would cross either budget guard.

> **Demo mode only.** The resource handlers speak an x402 v2-shaped HTTP exchange (`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE`), but the buyer uses a mock proof. The returned `SIMULATED-*` receipt IDs are not transaction hashes. No wallet, private key, facilitator, USDC transfer, or chain settlement is used. This is not a production payment client and its mock payment proof is not accepted by a real x402 facilitator.

## Demo cases

- **Complete the brief — $0.010 budget:** buys a $0.003 RWA alpha signal and a $0.005 market brief, then returns a combined result with risks and a suggested next step. On the second resource, the server deliberately drops the first acknowledgement after recording the mock settlement. The buyer retries once using the same idempotency key. The endpoint returns the original receipt, and the ledger counts it once.
- **Stop at the budget — $0.004 budget:** buys the $0.003 signal. The next endpoint quotes $0.005, so the buyer refuses before attaching payment. The run shows the refusal reason and leaves $0.001.

The per-call cap is a separate input. For example, lowering it below $0.005 causes the agent to refuse the market brief even when the total budget is high enough.

## What happens in a run

1. `POST /api/agent` starts one named job with a budget and per-call cap.
2. The agent requests a price challenge from `/api/paid/rwa-alpha` or `/api/paid/market-brief`. The unpaid endpoint returns HTTP 402, a base64 `PAYMENT-REQUIRED` header, and the same challenge as JSON for convenient display.
3. The buyer reads the accepted network, exact price, token, and resource URL. It checks the per-call cap and remaining job budget before it creates a payment proof.
4. When the guards pass, the buyer retries the resource with a base64 `PAYMENT-SIGNATURE` header and an `Idempotency-Key`.
5. The endpoint returns the purchased demo data and base64 `PAYMENT-RESPONSE`. For the second resource in the completion scenario, the first acknowledgement is intentionally dropped after the endpoint stores the mock receipt. Retrying with the same key returns that same receipt.
6. The agent adds the amount to the running total once, returns the job output, and logs each payment or refusal.

The server dispatches the two resource handlers in-process so the demo behaves consistently on serverless hosting. The resource handlers are also exposed as their own `/api/paid/...` routes. This exercises the negotiation and retry logic without requiring an external facilitator or payer key.

## Endpoints

| Route | Unpaid response | Price | Data returned after mock payment |
|---|---|---:|---|
| `GET /api/paid/rwa-alpha` | `402 Payment Required` | $0.003 | RWA signal, confidence and sample window |
| `GET /api/paid/market-brief` | `402 Payment Required` | $0.005 | Market summary, risks and next step |
| `POST /api/agent` | Agent run | — | Price checks, ledger, trace and combined job result |

Prices are displayed in USD for readability and sent in six-decimal test-token units in the simulated challenge. `eip155:688689` identifies Pharos Atlantic Testnet; the UI explicitly labels the exchange as simulation. The test token address is metadata for the demo challenge, not a claim that a real token was transferred.

## Budget and retry rules

For each resource, the buyer performs these checks in order:

```text
if price > perCallCap: refuse
else if runningTotal + price > totalBudget: refuse
else: make the paid retry
```

The check uses integer token base units for the quoted price. The running total only changes after a successful response with a receipt. A refusal is still written to the payment ledger with its quoted price, reason, and unchanged total.

Every call receives a run-scoped idempotency key. The mock endpoint stores the successful receipt against that key before it simulates the lost acknowledgement. If the buyer retries, the endpoint returns the stored receipt instead of producing another payment. The buyer also checks the transaction/receipt ID before incrementing its total. In production, this state would need durable storage with an atomic uniqueness constraint; this demo keeps the idempotency store in memory for one run.

## Payment ledger

The page records the run ID, resource bought (or refused), quoted price, receipt ID, decision, and running total. A refused purchase has no transaction. The ledger lives in browser memory and resets on reload; it is not a permanent accounting record.

The request trace shows the 402 discovery and each paid retry, including the retried request. This makes it possible to see that the same mock receipt is returned on retry while spend is counted once.

## Run locally

Requires Node.js 20 or newer and the Vercel CLI.

```sh
cd 12-x402-agent-buyer
npm install
npx vercel dev
```

Open the local URL printed by Vercel. The static UI is in `public/`; API routes are in `api/`. No environment variables are needed for mock mode.

To deploy this task separately, import the builds repository into Vercel and choose `12-x402-agent-buyer` as the project root.

## Arena requirement map

| Requirement | This demo |
|---|---|
| Call at least two x402 endpoints | Two separate paid-resource routes return their own 402 price challenge |
| Enforce a total budget and per-call cap | The agent checks both limits before attaching mock payment data |
| Log price, purchase, transaction and running total | The ledger records each simulated receipt and refusal; IDs are labelled simulated |
| Retry safely | The second completion purchase simulates a dropped acknowledgement and retries with the same idempotency key |
| Complete and budget-stop examples | Both scenarios are included and selectable from the page |

This is a protocol-flow simulation, not an on-chain payment implementation. It demonstrates the decisions and retry behavior, while clearly marking the payment proof and receipt as mock data.

## Links

- [Live demo](https://pharos-agent-arena-builds.vercel.app/x402-agent-buyer/)
- [Source folder](https://github.com/rajdeblol/pharos-agent-arena-builds/tree/main/12-x402-agent-buyer)
- [Arena task brief](https://pharos-agent-arena.vercel.app/tasks/x402-agent-buyer)
- [x402 v2 HTTP transport specification](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md)
