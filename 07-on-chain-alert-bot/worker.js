import { decimalToUnits, matchesWatch, parseWatchCommand } from "./src/bot-logic.mjs";
import { buildTelegramMessage, validateTelegramCredentials } from "./src/telegram.mjs";

const RPC_URL = "https://rpc.pharos.xyz";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CHAIN_ID = 1672;
const MAX_BLOCKS_PER_TICK = 500;

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Remote service request failed.");
  const data = await response.json();
  if (data.error) throw new Error("Remote service returned an error.");
  return data;
}

async function rpc(method, params = []) {
  const result = await postJson(RPC_URL, { jsonrpc: "2.0", id: 1, method, params });
  if (result.result === undefined) throw new Error("Pharos RPC response is incomplete.");
  return result.result;
}

async function telegram(token, method, body = {}) {
  const { result } = await postJson(`https://api.telegram.org/bot${token}/${method}`, body);
  if (result === undefined) throw new Error("Telegram response is incomplete.");
  return result;
}

function safeSymbol(value) {
  return String(value || "TOKEN").replace(/[^a-zA-Z0-9._$-]/g, "").slice(0, 18) || "TOKEN";
}

function decodeSymbol(hex) {
  const data = String(hex || "").replace(/^0x/, "");
  if (data.length < 64 || !/^[a-fA-F0-9]+$/.test(data)) return "TOKEN";
  const firstWord = data.slice(0, 64);
  let bytes;
  try {
    const offset = Number(BigInt(`0x${firstWord}`)) * 2;
    if (Number.isSafeInteger(offset) && offset >= 64 && offset + 64 <= data.length) {
      const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
      bytes = data.slice(offset + 64, offset + 64 + Math.min(length, 32) * 2);
    }
  } catch { /* Use bytes32 fallback below. */ }
  if (!bytes) bytes = firstWord;
  const raw = bytes.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)).filter((value) => value !== 0) || [];
  return safeSymbol(new TextDecoder().decode(new Uint8Array(raw)));
}

async function tokenMetadata(token) {
  const [symbolHex, decimalsHex] = await Promise.all([
    rpc("eth_call", [{ to: token, data: "0x95d89b41" }, "latest"]),
    rpc("eth_call", [{ to: token, data: "0x313ce567" }, "latest"]),
  ]);
  const decimals = Number(BigInt(decimalsHex));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Unsupported token decimals.");
  return { symbol: decodeSymbol(symbolHex), decimals };
}

function decodeTransfer(log, token, metadata) {
  if (!Array.isArray(log.topics) || log.topics.length < 3 || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null;
  const tx = String(log.transactionHash || "");
  const block = Number(BigInt(log.blockNumber));
  const logIndex = Number(BigInt(log.logIndex));
  const from = `0x${String(log.topics[1]).slice(-40)}`;
  const to = `0x${String(log.topics[2]).slice(-40)}`;
  const rawAmount = BigInt(log.data || "0x0");
  const unit = 10n ** BigInt(metadata.decimals);
  const integer = (rawAmount / unit).toString();
  const fraction = metadata.decimals ? (rawAmount % unit).toString().padStart(metadata.decimals, "0").replace(/0+$/, "") : "";
  return {
    id: `1672:${tx.toLowerCase()}:${logIndex}`,
    tx,
    block,
    logIndex,
    from,
    to,
    token,
    amount: fraction ? `${integer}.${fraction}` : integer,
    symbol: metadata.symbol,
    kind: from.toLowerCase() === ZERO_ADDRESS ? "MINT" : to.toLowerCase() === ZERO_ADDRESS ? "BURN" : "TRANSFER",
  };
}

async function sendMessage(token, chatId, text, html = false) {
  return telegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...(html ? { parse_mode: "HTML", disable_web_page_preview: true } : {}),
  });
}

function helpText() {
  return [
    "Pharos On-Chain Alert Bot",
    "/watch <token-address> <minimum> [wallet-address] — start monitoring",
    "/pause — pause monitoring",
    "/status — show current settings",
    "/help — show commands",
    "Use a Pharos Pacific ERC-20 token address.",
  ].join("\n");
}

async function getState(db) {
  return db.prepare("SELECT * FROM bot_state WHERE id = 1").first();
}

async function processUpdates(env, credentials, state) {
  const updates = await telegram(credentials.botToken, "getUpdates", {
    offset: Number(state.telegram_offset) || 0,
    limit: 100,
    timeout: 0,
    allowed_updates: ["message"],
  });

  for (const update of updates) {
    const message = update.message;
    if (message && String(message.chat?.id) === credentials.chatId && typeof message.text === "string") {
      const text = message.text.trim();
      const command = text.split(/\s+/, 1)[0].split("@")[0].toLowerCase();
      if (command === "/start" || command === "/help") {
        await sendMessage(credentials.botToken, credentials.chatId, helpText());
      } else if (command === "/watch") {
        const watch = parseWatchCommand(text);
        if (!watch) {
          await sendMessage(credentials.botToken, credentials.chatId, "Usage: /watch <token-address> <minimum> [wallet-address]. Use a valid Pharos ERC-20 address.");
        } else {
          await env.DB.prepare("UPDATE bot_state SET token = ?, minimum = ?, wallet = ?, last_block = NULL WHERE id = 1")
            .bind(watch.token, watch.minimum, watch.wallet || null).run();
          await sendMessage(credentials.botToken, credentials.chatId, `Watch set for ${watch.token}; minimum ${watch.minimum}${watch.wallet ? `; wallet ${watch.wallet}` : ""}. The next scan sets a live baseline.`);
        }
      } else if (command === "/pause") {
        await env.DB.prepare("UPDATE bot_state SET token = NULL, minimum = NULL, wallet = NULL, last_block = NULL, symbol = NULL, decimals = NULL WHERE id = 1").run();
        await sendMessage(credentials.botToken, credentials.chatId, "Monitoring paused.");
      } else if (command === "/status") {
        const latest = await getState(env.DB);
        await sendMessage(credentials.botToken, credentials.chatId, latest.token
          ? `Monitoring active.\nToken: ${latest.token}\nMinimum: ${latest.minimum}\nWallet filter: ${latest.wallet || "none"}\nLast block: ${latest.last_block ?? "baseline pending"}`
          : "Monitoring is paused. Use /watch <token-address> <minimum> [wallet-address] to start.");
      } else {
        await sendMessage(credentials.botToken, credentials.chatId, "Unknown command. Send /help for options.");
      }
    }

    await env.DB.prepare("UPDATE bot_state SET telegram_offset = ? WHERE id = 1").bind(update.update_id + 1).run();
  }
}

async function scanChain(env, credentials) {
  const state = await getState(env.DB);
  if (!state?.token || !state.minimum) return;

  const [chainHex, headHex] = await Promise.all([rpc("eth_chainId"), rpc("eth_blockNumber")]);
  if (Number(BigInt(chainHex)) !== CHAIN_ID) throw new Error("Pharos RPC returned the wrong chain.");
  const head = Number(BigInt(headHex));

  if (state.last_block === null) {
    await env.DB.prepare("UPDATE bot_state SET last_block = ? WHERE id = 1").bind(head).run();
    await sendMessage(credentials.botToken, credentials.chatId, `Monitoring is live from Pharos block ${head}. Earlier transfers will not alert.`);
    return;
  }
  if (head <= Number(state.last_block)) return;

  const fromBlock = Number(state.last_block) + 1;
  const toBlock = Math.min(head, fromBlock + MAX_BLOCKS_PER_TICK - 1);
  const [metadata, logs] = await Promise.all([
    state.decimals === null || !state.symbol
      ? tokenMetadata(state.token)
      : Promise.resolve({ symbol: state.symbol, decimals: Number(state.decimals) }),
    rpc("eth_getLogs", [{
      address: state.token,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics: [TRANSFER_TOPIC],
    }]),
  ]);

  if (state.decimals === null || !state.symbol) {
    await env.DB.prepare("UPDATE bot_state SET symbol = ?, decimals = ? WHERE id = 1").bind(metadata.symbol, metadata.decimals).run();
  }

  for (const log of logs) {
    const event = decodeTransfer(log, state.token, metadata);
    if (!event) continue;
    let matches;
    try { matches = matchesWatch(event, { minimum: state.minimum, wallet: state.wallet || "" }, metadata.decimals); }
    catch { continue; }
    if (!matches) continue;

    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO seen_events (event_id, seen_at) VALUES (?, CURRENT_TIMESTAMP)")
      .bind(event.id).run();
    if (!inserted.meta?.changes) continue;

    try {
      await sendMessage(credentials.botToken, credentials.chatId, buildTelegramMessage(event, state.minimum), true);
    } catch {
      console.error("Telegram alert delivery failed; event ID remains recorded to avoid duplicate spam.");
    }
  }

  await env.DB.prepare("UPDATE bot_state SET last_block = ? WHERE id = 1").bind(toBlock).run();
}

async function scheduledRun(env) {
  const credentials = validateTelegramCredentials(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
  if (!/^-?\d{1,20}$/.test(credentials.chatId)) throw new Error("Configure a numeric Telegram chat ID.");
  await env.DB.prepare("INSERT OR IGNORE INTO bot_state (id) VALUES (1)").run();
  const now = Math.floor(Date.now() / 1_000);
  const lock = await env.DB.prepare("UPDATE bot_state SET locked_until = ? WHERE id = 1 AND locked_until < ?")
    .bind(now + 120, now).run();
  if (!lock.meta?.changes) return;
  try {
    const state = await getState(env.DB);
    await processUpdates(env, credentials, state);
    await scanChain(env, credentials);
  } finally {
    await env.DB.prepare("UPDATE bot_state SET locked_until = 0 WHERE id = 1").run();
  }
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(scheduledRun(env).catch(() => console.error("Scheduled Pharos alert run failed.")));
  },

  async fetch(_request, env) {
    let bot = "Telegram bot";
    try {
      const credentials = validateTelegramCredentials(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
      const me = await telegram(credentials.botToken, "getMe");
      if (me.username) bot = `@${me.username}`;
    } catch { /* Health response does not reveal configuration or secret errors. */ }
    return Response.json({ service: "Pharos On-Chain Alert Bot", bot, commands: ["/watch", "/pause", "/status", "/help"], scanInterval: "1 minute" });
  },
};
