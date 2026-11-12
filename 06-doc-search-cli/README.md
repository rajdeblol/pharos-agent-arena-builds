# Pharos Docs Search CLI

`pharos-docs` searches Pharos developer documentation from a terminal. It uses the official Developer Docs MCP at `https://docs.pharos.xyz/~gitbook/mcp`, returns concise answers with sources, and says when a supported answer was not found.

**Browser demo:** [Ask Pharos Docs](https://pharos-agent-arena-builds.vercel.app/doc-search)

## Requirements

- Node.js 20 or newer
- Network access to the Pharos Developer Docs MCP

## Install

```sh
cd 06-doc-search-cli
npm ci
npm link
```

`npm link` adds the `pharos-docs` command to your PATH. Without linking, use `npm start -- "<question>"` from this directory.

## Usage

```sh
pharos-docs "how do I deploy a contract with Foundry?"
pharos-docs "what is the Pacific Mainnet chain ID?"
pharos-docs search "wallet connection" --limit 3
pharos-docs page /getting-started/network/pacific-mainnet
pharos-docs --help
```

Set `PHAROS_DOCS_MCP_URL` to use another compatible Developer Docs MCP endpoint. HTTPS is required, except for localhost during development.

## Example queries and output

These are representative excerpts from live Developer Docs MCP runs. The CLI prints the complete reply and up to five sources; answers and links can change as docs are updated.

### 1. Contract deployment

````text
$ pharos-docs "How do I deploy a contract with Foundry?"

For Pharos, use a Foundry deployment script:

1. Install Foundry, then compile and test your contract:

   ```sh
   forge build
   forge test
   ```
2. Create a script at `script/DeployToken.s.sol`. In its `run()` function, load the deployer key, start broadcasting, create the contract, then stop broadcasting:

   ```solidity
   uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
   vm.startBroadcast(deployerPrivateKey);

   Token token = new Token(1_000_000);

   vm.stopBroadcast();
   ```
3. Set the key and deploy to your chosen Pharos RPC:

   ```sh
   export PRIVATE_KEY=<your private key>
   forge script script/DeployToken.s.sol --rpc-url <PHAROS_RPC_URL> --broadcast
   ```

Make sure the deployer has enough testnet tokens to cover deployment costs. Keep the private key out of source files and version control.

See the full [Write Your First Token](https://docs.pharos.xyz/developer-guide/foundry/write-your-first-token) for setup and verification instructions.

Sources:
  1. Write Your First Token
     https://docs.pharos.xyz/developer-guide/foundry/write-your-first-token
  2. Write Your First NFT
     https://docs.pharos.xyz/developer-guide/foundry/write-your-first-nft
  3. Canonical Contracts
     https://docs.pharos.xyz/getting-started/canonical-contracts
  4. Validator Node Deployment
     https://docs.pharos.xyz/node-and-validator-guide/validator-node-deployment
  5. Foundry
     https://docs.pharos.xyz/developer-guide/foundry
````

### 2. Pacific Mainnet network details

````text
$ pharos-docs "What is the Pacific Mainnet chain ID and RPC URL?"

Pacific Mainnet uses **chain ID `1672`** and RPC URL **`https://rpc.pharos.xyz`**. See [Pacific Mainnet](https://docs.pharos.xyz/getting-started/network/pacific-mainnet).

Sources:
  1. Pacific Mainnet
     https://docs.pharos.xyz/getting-started/network/pacific-mainnet
  2. Atlantic Testnet
     https://docs.pharos.xyz/getting-started/network/atlantic-testnet
  3. x402 Pacific Mainnet
     https://docs.pharos.xyz/developer-guide/x402/x402-pacific-mainnet
  4. Node Management
     https://docs.pharos.xyz/node-and-validator-guide/node-management
  5. ZAN RPC
     https://docs.pharos.xyz/tooling-and-infrastructure/rpc/zan
````

### 3. No good answer found

```text
$ pharos-docs "What is the recipe for moon cheese?"

No good answer found in the Pharos docs for: What is the recipe for moon cheese?

Docs MCP reply: I can’t help with recipes from this docs site. I can help with questions about the products and topics covered here.

Try another query, for example: pharos-docs search "<keywords>"
```

## Commands

- A natural-language question asks Developer Docs MCP for a concise sourced answer.
- `search` lists matching pages and short excerpts.
- `page` prints a page from `docs.pharos.xyz`; other hosts are rejected.

If the MCP reply contains no approved Pharos documentation sources, the CLI does not present it as a supported answer. Network failures are reported to stderr and retried briefly; it never substitutes hardcoded documentation content.

## Tests

```sh
npm test
```

Tests cover answer/source parsing, no-answer handling, host validation, search parsing, and CLI arguments without requiring a live MCP connection.
