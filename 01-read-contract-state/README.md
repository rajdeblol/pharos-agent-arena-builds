# Contract Field Notes

A small read-only token reader for Pharos. Paste an ERC-20 address and it reads `name()`, `symbol()`, `decimals()`, and `totalSupply()` through Pharos Chain MCP. The values are pinned to one block so the page is a single snapshot.

The UI doesn't ask for a wallet connection. The server makes read-only MCP calls; it never asks for a key or broadcasts a transaction.

The page starts in white mode. Use the top-right control to switch between white and dark. Motion is subtle and respects reduced-motion settings.

## Run it

Needs Node.js 20 or newer.

```sh
npm install
npm start
```

Open [http://localhost:4173](http://localhost:4173). The app uses the hosted Pharos MCP endpoint at `https://mcp.pharos.xyz/mcp` by default. To point it at another compatible endpoint:

```sh
PHAROS_MCP_URL=https://mcp.pharos.xyz/mcp npm start
```

## Try it

The address in the form is Chainlink's LINK token on Pharos mainnet, chain ID `1672`:

```text
0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29
```

Or paste another contract address. The contract needs to implement the standard ERC-20 read methods listed below. A contract that doesn't expose them returns a clear error instead of a made-up result.

## What it reads

| Call | What the page shows |
|---|---|
| `name()` | Full token name |
| `symbol()` | Ticker |
| `decimals()` | Decimal places used to format supply |
| `totalSupply()` | Base-unit supply converted using the contract's decimals |

The backend first asks Chain MCP for the current chain info and block number, then calls all four methods at that same block. The result includes the contract address, chain ID, block number, explorer link, read time, human-formatted values, and raw return values.

## Live read captured

This is a real read from the default LINK contract, captured through Pharos Chain MCP on 11 Nov 2026. Each value came from the same block.

```text
Token name       ChainLink Token
Ticker           LINK
Total supply     3.972781885597664963 LINK
Decimals         18
Contract         0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29
Read at block    22,743,651
Read time        11 Nov 2026, 16:47 IST
```

The running app reads the current state each time; the capture above is a point-in-time example, not a hardcoded display value.

## How the MCP calls fit together

```text
Browser form
  → local Node server
    → Pharos Chain MCP: get_chain_info
    → Pharos Chain MCP: eth_call(name)       ┐
    → Pharos Chain MCP: eth_call(symbol)     │ same block
    → Pharos Chain MCP: eth_call(decimals)   │
    → Pharos Chain MCP: eth_call(totalSupply)┘
  ← readable snapshot + raw values + explorer link
```

The app uses the official Chain MCP tools `get_chain_info` and `eth_call`. It doesn't call an RPC from the browser or trust a client-entered decimal count.

## Limits

- This first cut reads the common ERC-20 interface. It doesn't guess at custom contract methods.
- Some older tokens encode `name()` or `symbol()` as `bytes32`; the reader handles that form too.
- The hosted MCP is read-only. This project has no transaction signing or write path.

## Links

- [Pharos Agent Arena task](https://pharos-agent-arena.vercel.app/tasks/read-contract-state)
- [Pharos Chain MCP](https://github.com/PharosNetwork/pharos-mcp)
- [Chainlink LINK on Pharos](https://docs.chain.link/resources/link-token-contracts)
