import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readEvents } from "../03-event-log-monitor/lib/monitor.mjs";
import { buildTelegramMessage, validateTelegramCredentials } from "./src/telegram.mjs";
import { decimalToUnits, matchesWatch, parseWatchCommand } from "./src/bot-logic.mjs";
import { loadLocalSecrets } from "./src/local-secrets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const statePath = process.env.ALERT_STATE_PATH || join(here, ".state.json");
const stateTempPath = `${statePath}.tmp`;
const MAX_SEEN_IDS = 5_000;
const POLL_TIMEOUT_SECONDS = 10;

await loadLocalSecrets(here);
const credentials = validateTelegramCredentials(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);
if (!/^-?\d{1,20}$/.test(credentials.chatId)) throw new Error("The Telegram worker needs a numeric private chat ID.");

function freshState() {
  return { offset: 0, watch: null, lastHead: null, seenIds: [] };
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8"));
    return {
      ...freshState(),
      offset: Number.isSafeInteger(parsed.offset) && parsed.offset >= 0 ? parsed.offset : 0,
      watch: parsed.watch && typeof parsed.watch === "object" ? parsed.watch : null,
      lastHead: Number.isSafeInteger(parsed.lastHead) && parsed.lastHead >= 0 ? parsed.lastHead : null,
      seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds.filter((id) => typeof id === "string").slice(-MAX_SEEN_IDS) : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") return freshState();
    throw new Error("Could not read the alert worker state file.");
  }
}

const state = await loadState();
let lastScanErrorAt = 0;
let stopping = false;

async function saveState() {
  await writeFile(stateTempPath, JSON.stringify(state), { mode: 0o600 });
  await rename(stateTempPath, statePath);
}

async function telegram(method, body = {}, timeoutMs = 15_000) {
  const endpoint = `https://api.telegram.org/bot${credentials.botToken}/${method}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(`Telegram ${method} failed.`);
  return result.result;
}

async function sendMessage(text, html = false) {
  return telegram("sendMessage", {
    chat_id: credentials.chatId,
    text,
    ...(html ? { parse_mode: "HTML", disable_web_page_preview: true } : {}),
  });
}

function helpText() {
  return [
    "Pharos On-Chain Alert Bot",
    "/watch <token-address> <minimum> [wallet-address] — start a transfer watch",
    "/pause — pause monitoring",
    "/status — show the current watch",
    "/help — show commands",
    "For /watch, replace placeholders with a real Pharos token address and minimum amount.",
  ].join("\n");
}

async function handleCommand(text) {
  const command = String(text || "").trim().split(/\s+/, 1)[0].split("@")[0].toLowerCase();
  if (command === "/start" || command === "/help") {
    await sendMessage(helpText());
    return;
  }

  if (command === "/watch") {
    const watch = parseWatchCommand(text);
    if (!watch) {
      await sendMessage("Usage: /watch <token-address> <minimum> [wallet-address]\nUse a real Pharos ERC-20 token address.");
      return;
    }
    state.watch = watch;
    state.lastHead = null;
    state.seenIds = [];
    await saveState();
    await sendMessage(`Watching ${watch.token} for transfers of at least ${watch.minimum}${watch.wallet ? ` involving ${watch.wallet}` : ""}. The first scan establishes a baseline; new matching transfers will alert here.`);
    return;
  }

  if (command === "/pause") {
    state.watch = null;
    state.lastHead = null;
    await saveState();
    await sendMessage("Monitoring paused.");
    return;
  }

  if (command === "/status") {
    await sendMessage(state.watch
      ? `Monitoring is active.\nToken: ${state.watch.token}\nMinimum: ${state.watch.minimum}\nWallet filter: ${state.watch.wallet || "none"}\nLast scanned block: ${state.lastHead ?? "baseline pending"}`
      : "Monitoring is paused. Use /watch <token-address> <minimum> [wallet-address] to start.");
    return;
  }

  await sendMessage("I didn’t recognize that command. Send /help to see available commands.");
}

async function pollTelegram() {
  while (!stopping) {
    try {
      const updates = await telegram("getUpdates", {
        offset: state.offset,
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ["message"],
      }, (POLL_TIMEOUT_SECONDS + 5) * 1_000);

      for (const update of updates) {
        const message = update.message;
        if (message && String(message.chat?.id) === credentials.chatId && typeof message.text === "string") {
          await handleCommand(message.text);
        }
        state.offset = update.update_id + 1;
        await saveState();
      }
    } catch {
      console.error("Telegram polling failed; retrying shortly.");
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
}

async function scanOnce() {
  const watch = state.watch;
  if (!watch) return;
  const initial = state.lastHead === null;
  const data = await readEvents({ token: watch.token, lookback: 20, since: initial ? undefined : String(state.lastHead) });
  if (state.watch !== watch) return;
  if (Number(data.chainId) !== 1672) throw new Error("Unexpected chain ID.");
  const decimals = Number(data.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Invalid token decimals.");

  const seen = new Set(state.seenIds);
  const fresh = (data.events || []).filter((event) => !seen.has(event.id));
  for (const event of fresh) seen.add(event.id);
  state.seenIds = [...seen].slice(-MAX_SEEN_IDS);
  state.lastHead = Number(data.head);
  await saveState();

  if (initial) {
    await sendMessage(`Monitoring is live from block ${state.lastHead}. Earlier transfers will not trigger alerts.`);
    return;
  }

  for (const event of fresh.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex)) {
    try {
      if (matchesWatch(event, watch, decimals)) {
        await sendMessage(buildTelegramMessage(event, watch.minimum), true);
      }
    } catch {
      console.error("Alert delivery failed; the event is recorded to prevent duplicate retries.");
    }
  }
}

async function monitorChain() {
  while (!stopping) {
    try {
      await scanOnce();
      lastScanErrorAt = 0;
    } catch {
      const now = Date.now();
      if (state.watch && now - lastScanErrorAt > 5 * 60_000) {
        lastScanErrorAt = now;
        await sendMessage("Pharos scan failed. The bot will retry automatically.").catch(() => {});
      }
      console.error("Pharos scan failed; retrying shortly.");
    }
    await new Promise((resolve) => setTimeout(resolve, 8_000));
  }
}

process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });
try {
  const me = await telegram("getMe");
  console.log(`Pharos Telegram watcher ready: https://t.me/${me.username}`);
  await sendMessage("Pharos on-chain alert bot is online. Send /help to configure a watch.");
  await Promise.all([pollTelegram(), monitorChain()]);
} catch {
  console.error("Could not start the Telegram watcher. Check the bot token, chat ID, and network access.");
  process.exitCode = 1;
}
