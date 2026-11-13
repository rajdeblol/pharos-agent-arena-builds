# Pharos dApp Support Agent

A read-only support demo for Pharos transactions. Paste a transaction hash to read its transaction and receipt through [Pharos Chain MCP](https://github.com/PharosNetwork/pharos-mcp), then get a plain-language status, likely failure cause, suggested next step, and explorer link.

## What it checks

- Receipt status and gas used versus the submitted gas limit.
- A read-only replay at the preceding block when a failed transaction can be replayed, to recover a revert reason.
- Common causes such as insufficient native gas funds, token balance or allowance, slippage, deadlines, access restrictions, and Solidity panic codes.
- Evidence returned by the chain, separated from the suggested fix.

Unknown custom errors and unrecoverable revert reasons are reported as unknown rather than guessed. A replay is diagnostic only: the state at the preceding block can differ from the exact state immediately before the transaction.

The app does not request a wallet connection, private key, or transaction signature. The hosted Pharos Chain MCP endpoint is read-only for this app.

## Run tests

From the repository root:

```sh
npm test --workspace=pharos-dapp-support-agent
```

The UI is served from `showcase/dapp-support-agent/`; the Vercel API handler is `api/dapp-support.mjs`.
