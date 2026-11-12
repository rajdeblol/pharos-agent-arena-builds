# Pharos On-Chain Alert Bot

A read-only Telegram bot that watches Pharos Pacific ERC-20 transfers and sends alerts when they meet a minimum amount.

## Features

- Watch a token and optional wallet with `/watch`.
- Start a ready-to-use USDC example with `/sample`.
- Receive command replies through Telegram webhooks.
- Get transfer amount, sender, recipient, block, and PharosScan link in each alert.
- Avoid duplicate event alerts with Cloudflare D1.

Telegram commands reply through webhooks. The chain is scanned once per minute, so transfer alerts may take up to one scan interval. A watch starts from a new baseline; past transfers are not replayed.

## Try the bot

Open [@rajpharosbot](https://t.me/rajpharosbot) and send `/start`, then `/sample`.

The sample watches Pharos USDC for transfers of at least 1 USDC:

```text
/watch 0xC879C018dB60520F4355C26eD1a6D572cdAC1815 1
```

The address is Circle's [USDC contract on Pharos mainnet](https://www.circle.com/blog/now-available-usdc-cctp-on-pharos). Alerts require a matching transfer after the baseline; the bot does not create test events.

## Commands

```text
/start                           Show instructions
/sample                          Watch Pharos USDC at a 1 USDC minimum
/watch <token> <minimum> [wallet]
/status                          Show the current watch
/pause                           Stop monitoring
```

Only the private chat configured by `TELEGRAM_CHAT_ID` can control monitoring.

## Deploy on Cloudflare

Requires Node.js 20+ and Wrangler. From the repository root:

```sh
npm install
cd 07-on-chain-alert-bot
npm run db:create
```

Set the returned database ID in `wrangler.jsonc`, then apply the schema, configure secrets, and deploy:

```sh
npm run db:migrate:remote
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npm run deploy
```

For local development, copy `.dev.vars.example` to `.dev.vars`, set local credentials, apply the local migration, and run `npm run dev`. Keep `.dev.vars` and bot tokens out of Git.

## Tests

```sh
npm test --workspace=pharos-on-chain-alert-bot
```
