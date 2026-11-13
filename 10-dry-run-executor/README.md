# Dry-Run Executor

Live demo: https://pharos-dry-run-executor-two.vercel.app/

A standalone Pharos Agent Arena build for **Dry-Run Executor** (SkillEngine, Medium, 100 points). Simulates Pacific transactions before signing and never broadcasts or holds a key.

## What it does

- Calls Pharos Chain MCP `eth_call` and `estimate_gas` against an unsigned transaction, pinned to the latest reported block.
- Reports success or revert (with decoded reason when available), gas estimate, fee, and a buffered gas limit.
- Previews sender/recipient token balances, allowances, and native PROS before and after the simulated transaction when available.
- Returns an unsigned transaction only when the call succeeds and the sender can cover the gas reserve; failed simulations and underfunded calls are blocked.
- Supports `pass`, `revert`, and `gas` sample scenarios, plus custom ERC-20 transfer, approve, and native PROS transactions.

The `--send` / `execute=1` option only exercises the gate again. It does not sign or broadcast.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run web
```

Open `http://localhost:3010`. To run a sample simulation from the CLI:

```bash
npm run dry-run -- --sample pass
npm run dry-run -- --sample revert
npm run dry-run -- --sample gas
npm run dry-run -- --from 0x... --to 0x... --token USDC --amount 1
```

## Deploy

Create a Vercel project with this directory (`10-dry-run-executor`) as its **Root Directory**. Its `vercel.json` serves `public/` and the `/api/dry-run` function. The API connects to the public Pharos Chain MCP at `https://mcp.pharos.xyz/mcp` by default; set `PHAROS_CHAIN_MCP_URL` only if using another compatible endpoint.

## Safety

Simulation is an estimate at a particular block and can differ from eventual execution. The app has no wallet connection, private key, signer, or transaction broadcast path. A passing result means the unsigned transaction is clear to review/sign elsewhere; it is not a guarantee of future execution.
