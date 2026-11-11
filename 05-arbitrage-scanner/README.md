# Pharos Arbitrage Scanner

A read-only scanner for the WPROS/USDC pools on Pharos mainnet. It reads DODO V2 and FaroSwap V2 at one block, compares both route directions, estimates costs, and records whether the result clears a profit threshold.

## What it does

- Reads token metadata and both pools through Pharos Chain MCP.
- Checks that the selected pools contain the expected token pair and validates DODO's base/quote order.
- Uses DODO's on-chain `querySellBase` and `querySellQuote` methods for executable quotes.
- Uses FaroSwap's live reserves and `feeRate()` (30 bps at the time of the pool check) for constant-product quotes.
- Compares DODO → FaroSwap and FaroSwap → DODO routes using the same trade size.
- Reports reserve-ratio mid-price spread, route result, a configurable slippage buffer, and a gas estimate using live MCP gas price.
- Labels the outcome `SKIP` or `SIMULATED PREPARE`. A prepare result is only a local summary; the app never signs or sends a transaction.

## Run locally

Requires Node.js 20 or newer.

```sh
cd 05-arbitrage-scanner
npm install
npx vercel dev
```

Or deploy this folder as the Vercel project root. The API endpoint is `POST /api/scan` and uses `https://mcp.pharos.xyz/mcp` by default. Set `PHAROS_MCP_URL` only if you want to point it at a compatible Chain MCP endpoint.

## Settings and assumptions

The default pair and pool addresses are editable in the page. The app checks token membership and ordering before quoting. Trade size is in the base token; the default is WPROS. Gas price comes from Chain MCP, while gas units, PROS-to-USD conversion, and the extra slippage buffer are estimates that can be edited. Change those inputs to see how the decision changes.

The DODO quote methods include protocol fees and pool impact in their returned amounts. FaroSwap quotes use the exposed fee and current reserves. The displayed mid-price spread is calculated from reserve ratios, so it is a comparison signal rather than a guaranteed executable profit. RPC data can change after a scan, and execution costs or fills can differ. The default USD conversion for PROS is illustrative, not a live oracle price.

## Safety

This is a monitor and decision preview, not an arbitrage bot. There is no wallet connection, private key, calldata signing, transaction submission, or automatic execution. If either live source fails, the scan fails closed and records `SKIP`.
