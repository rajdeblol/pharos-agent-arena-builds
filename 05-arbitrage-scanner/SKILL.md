# Development Guide

## Project boundaries

- `public/index.html` is the completed website. Preserve it byte-for-byte for backend and repository-organization work. Do not change its markup, styles, scripts, copy, layout, or behavior without an explicit request.
- `api/scan.mjs` is the Vercel function entry point for `POST /api/scan`. Keep this path and its request/response contract stable.
- Put scanner implementation modules in `src/`; keep Vercel route adapters in `api/`.
- Put automated tests in `test/`. Tests use Node's built-in test runner and should not require live network access.
- `scripts/verify-deployment.mjs` checks that Vercel still serves `public/` and includes the scan function.
- There is no database, transaction signer, wallet connection, or transaction submission path. Do not create migrations or add signing functionality as part of maintenance work.

## Scanner behavior

- The scanner reads DODO and FaroSwap at one pinned block through Pharos Chain MCP.
- Preserve the integer token-amount parsing, pool fee math, decimal handling, threshold comparison, and fail-closed behavior. Add focused tests for calculation changes and boundary cases.
- `SIMULATED_PREPARE` is a quote summary only. The application must remain read-only and must not send transactions.
- Keep user supplied token and pool addresses validated before contract calls. The MCP endpoint is deployment configuration, not a request field.

## Local checks

Use Node.js 20 or newer.

```sh
npm ci
npm test
npm run verify:deployment
node --check api/scan.mjs
node --check src/scan-handler.mjs
node --check src/calculations.mjs
```

For local Vercel behavior, run `npx vercel dev` and send a JSON `POST` to `/api/scan`. A live scan requires Pharos Chain MCP access. The project does not use TypeScript, Rollup, or Cloudflare Workers; do not add those configurations unless the deployment architecture changes deliberately.

## Deployment

Deploy with the project root set to this directory. `vercel.json` serves static files from `public/` and configures `api/scan.mjs` with a 60-second maximum duration. Keep both settings aligned with the Vercel adapter and verify them with `npm run verify:deployment`.
