# Whale Watching Agent

A read-only Pharos Pacific monitor for configurable wallet addresses. It scans recent USDC and WPROS transfer logs, highlights moves above adjustable thresholds, explains the counterparties and size, and summarizes activity for every watched wallet.

## What it covers

- Track 5–20 configurable EVM addresses. Eight sample wallets are prefilled and can be replaced or renamed.
- Set separate USDC and WPROS thresholds and scan a recent window of 1,000, 3,000, or 5,000 blocks.
- Review significant transfers with amount, direction, block, labeled counterparties, and a PharosScan transaction link.
- Compare recent inflow and outflow for each watched address, including wallets with no matching activity.

## Run locally

From the repository root, run `npm install` and `npx vercel dev` to serve the showcase and `/api/whale-watching` together. The watcher uses the read-only Pharos Chain MCP at `https://mcp.pharos.xyz/mcp`; set `PHAROS_MCP_URL` only to use another compatible endpoint.

The scan never connects a wallet, signs, or broadcasts transactions. Transfer logs and labels are context for review, not proof of intent or ownership.

