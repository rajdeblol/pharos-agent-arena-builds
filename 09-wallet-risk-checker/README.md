# Pharos Wallet Risk Checker

A read-only pre-interaction check for a Pharos Pacific wallet or contract. It reads live data through [Pharos Chain MCP](https://github.com/PharosNetwork/pharos-mcp), pins state reads to one block, and reports a low, medium, or high risk level with the underlying signals and a plain-language recommendation.

## Signals

- Address type and bytecode presence, native PROS balance, and transaction nonce.
- Circle USDC's current `isBlacklisted(address)` result for the submitted address.
- Current `paused()` state and EIP-1967 or minimal-proxy implementation indicators for contracts.
- Circle USDC transfers and approvals in a selected recent block window (1,000, 3,000, or 5,000 blocks).
- Current allowance for up to five recent USDC spenders; an unusually large active allowance is flagged for review.
- Known zero and burn addresses.

Circle lists `0xC879C018dB60520F4355C26eD1a6D572cdAC1815` as its USDC contract on Pharos. [Circle's Pharos USDC announcement](https://www.circle.com/blog/now-available-usdc-cctp-on-pharos)

The live examples are an active wallet (`0x1f5178a9d234955f983607b690ceeb2db9ae55bf`, low risk when last checked) and `0x000000000000000000000000000000000000dEaD`, a known burn-address example. Their live results can change as chain data changes. The USDC preset resolves to Circle's token contract; it can surface contract-specific controls and is not presented as a guaranteed safe wallet.

Unknown contracts are not automatically considered malicious. Chain MCP exposes bytecode but not source-code verification; the report does not imply that code is verified. Transfer history is limited to Circle USDC in the chosen block window. A low result is not a safety guarantee, and a partial-data report cannot receive a low verdict.

## Run tests

From the repository root:

```sh
npm run wallet-risk:test
```

The static demo is in `showcase/wallet-risk-checker/`; Vercel serves address scans through `api/wallet-risk-checker.mjs`. The checker never connects a wallet, reads a private key, signs, or broadcasts a transaction.
