# Saga Executor · Task 13

This build adds the Pharos Agent Arena Saga Executor to the Pharos Builds collection. The implementation is based on the working [shoupeorg/pharos-saga-executor](https://github.com/shoupeorg/pharos-saga-executor) project; its worker, saga state machine, contracts, migrations, Skill guide, and evidence are included here.

The browser demo is served from `showcase/saga-executor/`. Its `/saga-api/*` requests are proxied by the root Vercel configuration to the reference project's live Atlantic testnet worker. This avoids browser cross-origin restrictions while keeping the reference worker's persistent D1 state and dedicated signer. The demo uses valueless SGT on Atlantic Testnet (chain ID 688689), not mainnet assets or a connected user wallet. Starting a saga sends real testnet transactions from that server-side signer.

Open the live showcase at `/saga-executor/`. The success and forced-failure controls run the respective live testnet scenarios; `failure-broadcast` intentionally mines a controlled reverting deposit before verifying refund and allowance-revoke compensation. Retry evidence is explicitly simulated.

For full architecture, safety bounds, contract addresses, transaction evidence, and the standalone Worker deployment instructions, see [REFERENCE-README.md](REFERENCE-README.md).
