# Docs MCP Onboarding

A small field log for trying to get started with `ai.pharos.xyz` using the Pharos Developer Docs MCP. It keeps the original answers and four gaps together, and lets you ask those same questions again to see what the docs say now.

## What it does

- Shows the recorded onboarding attempt, exact questions, answers, and suggested docs fixes.
- Lets you run all four questions again, or run one on its own.
- Displays the live `askQuestion` response and when it came back. Wording and cited pages may change between runs.

The live panel sends only the four built-in questions to `https://docs.pharos.xyz/~gitbook/mcp`. It does not accept custom prompts, connect a wallet, or send transactions. Live answers are shown in the page and are not saved as a new report.

## Run locally

From this folder:

```sh
npm install
npx vercel dev
```

Open the local URL Vercel prints. The page is static; the `/api/onboard` function makes the live Docs MCP request.

## Deploy

The Vercel project uses this folder as its root directory. Pushes to `main` trigger a production deployment.
