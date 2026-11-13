# Whale Watching Agent

A read-only Pharos Pacific monitor for configurable wallet addresses. It scans USDC and WPROS transfer logs, highlights moves above the chosen thresholds, and summarizes activity for each watched wallet.

## Project layout

```text
11-whale-watching-agent/
├── src/
│   ├── api/
│   │   └── handler.mjs       # HTTP entry point for the scan API
│   └── services/
│       └── watcher.mjs       # Pharos MCP client, log decoding, and summaries
├── package.json
└── README.md
```

The user interface lives in `showcase/whale-watching-agent/`. The repository-level `api/whale-watching.mjs` forwards Vercel requests to the handler above.

## Features

- Use the preset wallet list or enter custom addresses.
- Choose USDC and WPROS alert thresholds.
- Start with a fast 250-block scan, or scan 1,000, 5,000, or 10,000 blocks.
- Review transfer direction, amount, block, addresses, and transaction links.
- Keep live monitoring running or stop it at any time.
- Optionally include token and native balance snapshots.

## Run locally

From the repository root, install dependencies and run `npx vercel dev` to serve the showcase and `/api/whale-watching` together. The service uses the read-only Pharos Chain MCP endpoint at `https://mcp.pharos.xyz/mcp`. Set `PHAROS_MCP_URL` to use another compatible endpoint.

The app never connects a wallet, signs a transaction, or broadcasts one.
