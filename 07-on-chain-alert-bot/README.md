# Pharos On-Chain Alert Bot

A Telegram bot for monitoring Pharos ERC-20 transfers. Telegram webhooks deliver commands directly to the Worker; Cloudflare Cron registers the webhook and scans the chain once a minute. D1 persists settings, scan cursor, Telegram update offset, and event IDs. The bot is read-only and never requests a wallet or private key.

## Telegram commands

```text
/start
/watch <token-address> <minimum> [wallet-address]
/pause
/status
/help
```

Only the private chat configured as `TELEGRAM_CHAT_ID` can control this bot. A `/watch` starts from the next current block, so past transfers do not alert. Alerts include value, sender, recipient, block, event ID, and a PharosScan link. Telegram command replies are webhook-driven; on-chain transfer alerts can lag by up to one scan interval.

## Free Cloudflare setup

Requires Node.js 20+. From the repository root:

```sh
npm install
cd 07-on-chain-alert-bot
npm run db:create
```

Copy the returned D1 database ID into `database_id` in `wrangler.jsonc`, then run:

```sh
npm run db:migrate:remote
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npm run deploy
```

Use a newly rotated token from [@BotFather](https://t.me/BotFather). Do not commit `.dev.vars` or paste the token into the website. Local development uses `.dev.vars` (copy `.dev.vars.example`) and `npm run db:migrate:local` before `npm run dev`.

Cloudflare Workers Cron and D1 have free allowances suitable for this low-volume, one-minute watcher. Free-tier limits still apply; see [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Tests

```sh
npm test --workspace=pharos-on-chain-alert-bot
```
