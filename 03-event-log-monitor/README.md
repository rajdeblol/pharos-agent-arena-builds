# Pharos Event Log Monitor

A small live monitor for ERC-20 `Transfer` events on Pharos Pacific Mainnet. It reads public chain data through Pharos Chain MCP, decodes the sender, recipient, amount, block and transaction, and checks again every eight seconds while monitoring is active.

The first scan covers a bounded history window. Refreshes overlap the last five blocks so late-indexed logs are picked up; events are deduplicated by transaction hash and log index. The app is read-only and does not connect to a wallet or submit transactions.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open `http://localhost:4176`. The default contract is Pharos mainnet USDC. You can paste another ERC-20 contract and select a history window of up to 1,000 blocks.

## Notes

- Uses `get_chain_info`, `get_block_number`, `get_logs`, and `eth_call` through `https://mcp.pharos.xyz/mcp`.
- Each `get_logs` request is limited to a 1,000-block span; the API accepts scans up to 2,000 blocks and pages larger selections.
- The feed displays at most 100 recent events. It does not retain a server-side history between visits.
- An RPC outage, rate limit, non-ERC-20 contract, or unusually busy log window can make a scan fail; retry after a short wait.

## Data source

The monitor reads Pharos mainnet event data through the [Pharos Chain MCP](https://mcp.pharos.xyz/mcp).
