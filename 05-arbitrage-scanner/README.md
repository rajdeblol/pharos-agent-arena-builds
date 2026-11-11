# Pharos Arbitrage Scanner

A read-only WPROS/USDC pool comparison for Pharos Pacific Mainnet. Each scan reads DODO V2 and FaroSwap V2, checks both possible two-pool routes at one pinned block, estimates the costs, and records a `SKIP` or `SIMULATED_PREPARE` decision.

The app is designed to show the quote and the assumptions behind the decision. It does not connect a wallet or trade.

## Why compare two pools?

A price difference by itself is not enough to call something an arbitrage opportunity. The amount that can be traded changes the pool price, each venue charges a fee, and the swap also consumes gas. The scanner therefore compares the route output for a chosen size and deducts a slippage buffer and a gas estimate before applying the minimum-profit threshold.

The two venues here are DODO V2 and a FaroSwap V2 WPROS/USDC pool. They are two on-chain liquidity sources on the same chain, not an external oracle or separate market. The displayed spread is a signal from reserve-ratio mid-prices; the route quotes determine the estimated trade result.

## What one scan does

1. The browser sends the selected pair, pools, trade size, threshold, and cost assumptions to `POST /api/scan`.
2. The server opens a Streamable HTTP connection to Pharos Chain MCP (`https://mcp.pharos.xyz/mcp` by default).
3. It reads the Pharos chain details and latest block number, then uses that block number for the contract reads and quotes in this scan.
4. It reads each token's `symbol()` and `decimals()` so the raw integer amounts can be shown in human units.
5. It reads the DODO pool's base/quote token addresses and reserves. It reads FaroSwap's `token0()`, `token1()`, `getReserves()`, and `feeRate()`.
6. It checks that the pool addresses contain the selected pair and that DODO's base and quote order matches the form. An invalid address, wrong pair, or failed read stops the scan.
7. It quotes both directions, calculates a reserve-ratio spread and estimated cost waterfall, reads the current gas price, and compares the resulting net estimate with the threshold.
8. The browser renders the result and adds a row to the current page's scan log.


## Pool and token defaults

| Item | Default |
|---|---|
| Network | Pharos Pacific Mainnet, chain ID 1672 |
| Base token | WPROS — `0x52C48d4213107b20bC583832b0d951FB9CA8F0B0` |
| Quote token | USDC — `0xC879C018dB60520F4355C26eD1a6D572cdAC1815` |
| DODO V2 pool | `0xac998dD78829aDe9f654e0BE7a4D7F60D8B37196` |
| FaroSwap V2 pool | `0x7F4A462FC320db1E26dd1366DcE9E276eE6c5930` |
| FaroSwap fee observed during implementation | 30 bps; read again on every scan |

These values are defaults, not trusted blindly: the scanner re-reads pool token addresses and pair ordering before it accepts quotes. You can edit the addresses in the UI to inspect another compatible pair/pool; incompatible contracts fail closed.

## Quote paths

The scanner evaluates the same starting WPROS amount through both possible routes:

- **DODO → FaroSwap:** DODO `querySellBase(trader, amountIn)` estimates WPROS to USDC; the received USDC is then sent through FaroSwap's USDC-to-WPROS constant-product formula.
- **FaroSwap → DODO:** FaroSwap's constant-product formula estimates WPROS to USDC; that output is passed to DODO `querySellQuote(trader, quoteAmount)` to estimate the return amount in WPROS.

DODO's `querySellBase` and `querySellQuote` quotes include the pool's own quote behaviour and fees. FaroSwap output uses the reserves and `feeRate()` read for that pool. The scanner compares the returned WPROS amount with the starting amount and chooses the higher-output route for the result. The DODO trader argument is a fixed placeholder address; this is a quote call only and no wallet address is involved.

## How the numbers are calculated

All reserve and quote values from the EVM are integer quantities. Token decimals are applied when converting values for display and USD estimates.

The submitted trade size is converted to raw token units from its decimal string, using integer arithmetic. Inputs with more fractional digits than the base token supports are rejected instead of being rounded through JavaScript floating point. The route's base-token profit is also calculated from the integer difference between output and input before conversion to USD.

### Mid-price and gross spread

For each venue, the scanner estimates a spot mid-price from its reserve ratio:

```text
midPrice = quoteReserve / 10^quoteDecimals
            --------------------------------
            baseReserve / 10^baseDecimals
```

The gross spread compares the two mid-prices against the lower one:

```text
grossSpreadBps = abs(dodoMidPrice - faroMidPrice)
                 / min(dodoMidPrice, faroMidPrice) * 10,000

grossUsd = grossSpreadBps / 10,000
            * tradeSizeInBase * min(dodoMidPrice, faroMidPrice)
```

This is a reserve-ratio comparison, not a promise that the full displayed spread can be captured at the chosen size.

### FaroSwap quote

For a constant-product pool, the output estimate applies the pool fee before calculating the reserve change:

```text
feeAdjustedInput = amountIn * (10,000 - feeBps)
amountOut = feeAdjustedInput * reserveOut
            / (reserveIn * 10,000 + feeAdjustedInput)
```

The fee is therefore included in each FaroSwap leg. Pool impact is also reflected because the output uses the actual input against the live reserves instead of multiplying by the spot price only.

### DODO quote

The server calls the pool's on-chain `querySellBase` or `querySellQuote` view method with the route amount and the pinned block. The first returned integer is used as the estimated output. This avoids treating the DODO PMM as if it were a constant-product AMM.

### Route result and pool cost

The best route's returned WPROS amount is compared with the starting WPROS amount and converted to USD using the DODO reserve-ratio mid-price:

```text
routeProfitUsd = (bestRouteOutputBase - startingBaseAmount) * dodoMidPrice
poolCostsUsd = grossUsd - routeProfitUsd
```

`poolCostsUsd` is the residual between the theoretical mid-price spread and the quoted route result. It represents the effect of swap fees and price impact embedded in the route quotes; it is not a separately itemized protocol fee receipt.

### Slippage buffer and gas

The extra slippage buffer is applied on top of the route quotes:

```text
slippageUsd = tradeSizeInBase * min(dodoMidPrice, faroMidPrice)
              * slippageBps / 10,000
```

Gas price is read live with Chain MCP's `get_gas_price`. Gas units (260,000 by default) and the PROS/USD conversion (0.10 by default) are user-editable estimates:

```text
gasUsd = gasUnits * gasPriceGwei * 10^9 / 10^18 * prosUsd
netUsd = grossUsd - poolCostsUsd - slippageUsd - gasUsd
```

The net formula is equivalent to the quoted route profit minus the extra slippage buffer and gas. A `SIMULATED_PREPARE` result is returned only when `netUsd` is strictly greater than the configured minimum. At or below the threshold, the result is `SKIP` and includes the reason.

## Reading a result

- **Gross mid-price spread:** the difference between the two reserve-ratio prices before quote costs.
- **Pool fees + price impact:** the residual cost between that gross comparison and the selected route's quote result.
- **Slippage buffer:** an additional user-selected allowance; it is not a live prediction from an oracle.
- **Estimated gas:** live gas price multiplied by the editable gas-unit estimate and editable PROS/USD conversion.
- **Net after costs:** the value compared against the profit threshold.
- **Best route:** the route with the higher returned WPROS quantity for the selected input amount.
- **Decision:** `SKIP` or `SIMULATED_PREPARE`.

A simulated prepare is a small local JSON summary containing the route, amount, and net estimate. It is **not** calldata, a signed transaction, or a transaction ready to submit. This implementation previews a threshold decision; it does not execute or send swaps.

## Inputs

| Setting | Default | What it controls |
|---|---:|---|
| Trade size | 0.1 WPROS | Starting amount for both routes |
| Minimum net profit | $0.05 | Strict decision threshold |
| Gas units | 260,000 | Estimated total gas for a two-leg route |
| PROS/USD | $0.10 | Editable conversion used only for the gas estimate |
| Extra slippage buffer | 30 bps | Additional cost deducted after route quotes |
| Token and pool addresses | WPROS/USDC defaults above | Contracts to read; pair membership and DODO order are checked |

Changing the gas conversion or slippage allowance can change the decision. They are deliberately visible rather than hidden in server code.

## Scan log

Every completed scan adds time, selected route, net result, and decision to the page log. The log is held in browser memory for the current page session only. Reloading the page clears it; scans are not stored in a database or shared between visitors.

If MCP or a pool read fails, the API returns an error and a `SKIP` reason. It does not substitute cached prices or produce a simulated prepare from incomplete data.

## Run locally

Requires Node.js 20 or newer and the Vercel CLI.

```sh
cd 05-arbitrage-scanner
npm install
npx vercel dev
```

Open the local URL printed by Vercel. The static page is in `public/`; Vercel maps `api/scan.mjs` to the serverless `POST /api/scan` endpoint, which imports its implementation from `src/scan-handler.mjs`. Shared calculations live in `src/calculations.mjs`. The endpoint uses the public Pharos Chain MCP endpoint by default; set `PHAROS_MCP_URL` only when using another compatible MCP server.

To deploy this task by itself, import the GitHub repository into Vercel and set the project root directory to `05-arbitrage-scanner`. The included `vercel.json` sets `public/` as the static output and gives the scan function a 60-second maximum duration.

## Arena requirement map

| Task requirement | Where this build addresses it | Evidence in the demo |
|---|---|---|
| Read two sources in the same scan | DODO and FaroSwap contract reads are pinned to the fetched block | The result shows one block number and both venue prices/routes |
| Include fees, slippage, and gas | Venue quotes include their fees and price impact; the UI adds the slippage buffer and gas estimate | Cost waterfall and net estimate appear after each run |
| Apply a configurable profit threshold and explain skips | User-set minimum is compared with net estimate using a strict `>` check | Result is `SKIP` with a reason, or a local simulated summary |
| Log each scan | Each completed run adds route, net result, and decision to the page log | Scan log below the form; it lasts for the current page session |
| Use safe or simulated execution | The app is read-only and never submits trades | `SIMULATED_PREPARE` is a JSON preview only; no wallet or transaction path exists |

The last requirement is handled as a simulation. This build does not generate a transaction or calldata, so reviewers should treat it as a safe threshold-decision demo rather than an executing arbitrage Skill.

## Repository structure

| Path | Purpose |
|---|---|
| `api/scan.mjs` | Vercel route adapter for `POST /api/scan` |
| `src/` | Scanner handler and reusable calculation modules |
| `public/` | Completed static website |
| `test/` | Offline unit and API contract tests |
| `scripts/` | Deployment configuration verification |
| `vercel.json` | Static output and serverless function configuration |
| `SKILL.md` | Project-specific development and safety instructions |

There is no database, so this project has no migrations. It has no bundled frontend build, TypeScript, Rollup, or Cloudflare Worker runtime, so those configurations are intentionally not part of this repository.

Run `npm test` for the offline test suite and `npm run verify:deployment` to check the Vercel output and API route configuration. A hosted Vercel production build still depends on the deployment platform; this repository does not define a local build command.

## Limitations

- This is a two-pool comparison for one pair, not a router search across all Pharos liquidity.
- The build is a browser/API demo using Chain MCP. It is not registered or executed as a SkillEngine skill.
- The two pools are on the same network and their values come through the same Chain MCP connection. There is no independent oracle benchmark.
- Reserve-ratio mid-prices are approximate, particularly for a PMM pool. The quote methods are used for route amounts, but the gross-spread and USD conversions remain estimates.
- The PROS/USD value and gas-unit count are user-set assumptions; only gas price is read live.
- Quotes are pinned to the fetched block, but the market can move before any hypothetical later transaction. No atomic execution or backrun protection is implemented.
- The app does not build calldata or execute trades, so it cannot guarantee a fill or realized profit.
- The scan history is session-local and is not durable audit storage.

## Safety

The app has no wallet connection, private-key input, signing method, or transaction submission path. There is no automatic execution. Pool identity checks and fail-closed errors prevent a bad read from being presented as an opportunity, but they do not make an estimated route profitable or risk-free.

## Links

- [Live demo](https://pharos-arb-scanner-raj.vercel.app/)
- [Source folder](https://github.com/rajdeblol/pharos-agent-arena-builds/tree/main/05-arbitrage-scanner)
- [Arena task brief](https://pharos-agent-arena.vercel.app/tasks/arbitrage-scanner)
- [Pharos Chain MCP endpoint](https://mcp.pharos.xyz/mcp)

AI assistance was used while creating the UI and README.
The pool reads, calculations, assumptions, and safety limits are documented above.
