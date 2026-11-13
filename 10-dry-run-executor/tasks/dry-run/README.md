# Dry-Run Executor

Simulates a Pacific transaction before anyone signs it. Read-only. Chain MCP. The server never calls `send_raw_transaction` and never holds a key.

| Requirement | How |
|---|---|
| Simulate without broadcasting | `eth_call` plus `estimate_gas` on the unsigned transaction, pinned to one block from `get_chain_info` |
| Success or revert, with the reason and the gas | A revert is decoded (balance, allowance, the contract's own text). A success reports the estimate, the wei gas price, the PROS fee, and a limit 20% above the estimate |
| Before and after | Token balance of the sender and the recipient, the allowance, or both sides of a PROS send. Each row shows before, after, and a signed change. Numbers move only when the call succeeded and the wallet covers the gas limit. Otherwise they stay unchanged |
| Block execution when the simulation fails | The unsigned transaction is dropped and the send control stays off until a simulation passes. A second request with `execute=1` or `--send` runs the same check and still does not broadcast |

Three samples, all live on Pacific:

| Sample | What it shows |
|---|---|
| `pass` | Transfer 1 USDC from a public wallet that holds USDC and PROS. Gate says clear to sign. Nothing is sent |
| `revert` | Same wallet, amount far above its USDC. The contract reverts. Execution is blocked |
| `gas` | Transfer 1 USDC from the WPROS/USDC pool. The call itself succeeds, but the pool has 0 PROS, so the fee cannot be paid and execution is blocked |

```bash
npm run dry-run -- --sample pass
npm run dry-run -- --sample revert
npm run dry-run -- --sample gas
npm run dry-run -- --sample pass --send
npm run dry-run -- --from 0x... --to 0x... --token USDC --amount 1
```

The unsigned transaction is legacy type 0, chain 1672, which is how Pacific publishes transactions. The gas limit follows the gas model: estimate × 1.2, so a refund cannot make it run out. The fee shown is the estimate, not the ceiling.

Live page: https://pharos-dry-run.vercel.app
