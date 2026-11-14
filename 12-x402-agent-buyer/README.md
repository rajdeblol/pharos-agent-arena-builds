# x402 Agent Buyer

A wallet-based buyer that calls two x402-protected Pharos Atlantic endpoints. It reads each live quote, applies the per-call cap and total budget, asks the connected wallet to sign only an approved amount, and verifies the returned transaction against the token's `Transfer` log.

**Live demo:** [Open buyer](https://pharos-agent-arena-builds.vercel.app/x402-agent-buyer/)

## Live payment flow

1. The buyer reads the seller's public status and current Atlantic block.
2. It requests `/paid/network-snapshot` and `/paid/activity-summary` through a same-origin proxy. Each route first returns HTTP 402 and a `PAYMENT-REQUIRED` challenge.
3. Before opening the wallet, the buyer checks the challenge's network, token, merchant, listed price, per-call cap, and remaining run budget.
4. The wallet signs an EIP-3009 `TransferWithAuthorization`. The private key never leaves the wallet. The facilitator submits the authorization and pays network gas; the payer's test USDC is transferred to the seller.
5. The buyer retries the same HTTP request with the signed x402 payload. If the transport response is lost, retries reuse that exact authorization; the buyer never signs a replacement for the same attempt.
6. The buyer decodes `PAYMENT-RESPONSE`, looks up the receipt on Atlantic, and confirms the exact USDC `Transfer` before recording the purchase as confirmed.

The API is hosted by [shoupeorg/pharos-x402-paywalled-api](https://github.com/shoupeorg/pharos-x402-paywalled-api). Its public status endpoint currently reports the seller and facilitator operational on `eip155:688689`.

## Paid resources

| Route | Price | Data |
|---|---:|---|
| `/paid/network-snapshot` | `0.001 USDC` | Pinned Pharos block, base fee, and token balances |
| `/paid/activity-summary` | `0.002 USDC` | Transaction counts and gas use across a three-block window |

The configured token is Pharos Atlantic test USDC, `0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B` (6 decimals). The receipt lookup checks the exact token contract, sender, recipient, and amount.

## Run scenarios

- **Complete the brief:** default budget `0.005 USDC`, cap `0.002`. After two wallet confirmations, the two resources cost `0.003 USDC` total.
- **Stop at the budget:** budget `0.001 USDC`, cap `0.002`. The buyer can purchase the first route; it refuses the second `0.002 USDC` quote before asking for another signature.

Change the limits before starting. Equality is allowed; only a quote that exceeds a limit is refused. Completed payments and refusals are kept in the browser's local ledger. The ledger stores tx hashes and decisions, never payment signatures.

## Wallet and funding

Use MetaMask or another browser-injected EVM wallet on **Pharos Atlantic Testnet** (chain ID `688689`). The page can request the network switch. The complete scenario spends `0.003 USDC` test tokens if both wallet signatures are approved; the budget-stop scenario spends `0.001 USDC` if the first signature is approved. The wallet displays each exact authorization. You need test USDC in the connected account; the facilitator covers transaction gas.

This page does not collect a seed phrase or private key, and it never starts a payment without an explicit wallet signature. A signature authorizes a specific amount, recipient, token, and short expiry. Cancel or reject it in the wallet to stop.

## Run locally

Requires Node.js 20+ and Vercel CLI.

```sh
cd 12-x402-agent-buyer
npx vercel dev
```

Open the local URL in a browser with a funded Atlantic wallet. `api/upstream.mjs` proxies only the configured seller's status, two paid endpoints, and the public RPC receipt lookup; it is not an open proxy. No private-key or facilitator secrets are used by this buyer.

## Scope and limits

- This is an Atlantic testnet flow, not a mainnet checkout.
- The seller and facilitator belong to the linked third-party API. Their uptime and settlement rules are outside this buyer's control.
- Spending guard state is held in the browser for one run. The connected wallet remains the final signer; server-side task limits are not a substitute for the buyer's own cap checks.
- An ambiguous response is retried with the same authorization. If a receipt is not yet visible, the run stops and marks settlement pending rather than issuing another payment.

## Links

- [Live demo](https://pharos-agent-arena-builds.vercel.app/x402-agent-buyer/)
- [This repo's source folder](https://github.com/rajdeblol/pharos-agent-arena-builds/tree/main/12-x402-agent-buyer)
- [Live seller API source](https://github.com/shoupeorg/pharos-x402-paywalled-api)
- [Arena task](https://pharos-agent-arena.vercel.app/tasks/x402-agent-buyer)
- [Pharos x402 docs](https://docs.pharos.xyz/developer-guide/x402)
