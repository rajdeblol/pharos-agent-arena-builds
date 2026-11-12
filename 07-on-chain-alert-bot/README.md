# Pharos On-Chain Alert Bot

A persistent Telegram bot that watches Pharos ERC-20 `Transfer` logs. Configure a minimum amount and optional wallet in Telegram; matching new events arrive as messages with transfer details and a PharosScan link. It is read-only and does not need a wallet or private key.

## Telegram commands

```text
/start
/watch <token-address> <minimum> [wallet-address]
/pause
/status
/help
```

In `/watch`, replace the placeholders with a real Pharos ERC-20 address, a minimum amount, and optionally a wallet to filter. The bot scans Pharos Mainnet every eight seconds. The first scan records a baseline and does not alert on historical transfers. Event IDs and Telegram update offsets are persisted to avoid duplicate alerts and repeated commands after restarts.

## Run locally

Requires Node.js 20 or newer. Set `TELEGRAM_BOT_TOKEN` and your numeric private `TELEGRAM_CHAT_ID` in `.env.local`, then run from the repository root:

```sh
npm install
npm run onchain-alert
```

Create the bot with [@BotFather](https://t.me/BotFather), send it `/start`, and get your numeric chat ID from [@userinfobot](https://t.me/userinfobot). Only that configured chat can control the worker. The bot prints its direct `t.me` link when it starts.

## Always-on hosting

This is a long-running worker, so Vercel serverless functions are not used for this task. `render.yaml` defines a Render Background Worker and persistent disk. Deploy the repository from Render, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` as private environment values, then open the bot link from its startup logs. The worker state path is configured to the mounted disk.

For local runs, state is written to the ignored `.state.json` file. Keep `.env.local` and `.state.json` out of Git. If a bot token has been shared in chat, revoke it with @BotFather and use the replacement.

## Tests

```sh
npm test --workspace=pharos-on-chain-alert-bot
```
