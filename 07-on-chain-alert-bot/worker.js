const WATCH_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const DECIMAL = /^\d{1,30}(?:\.\d{1,36})?$/;

function parseWatchCommand(text) {
  const [command, token, minimum, wallet, extra] = String(text || "").trim().split(/\s+/);
  if (command?.split("@")[0].toLowerCase() !== "/watch" || !WATCH_ADDRESS.test(token || "") || !DECIMAL.test(minimum || "") || extra !== undefined) return null;
  if (wallet && !WATCH_ADDRESS.test(wallet)) return null;
  if (!/[1-9]/.test(minimum)) return null;
  return { token, minimum, wallet: wallet?.toLowerCase() || "" };
}

function decimalToUnits(value, decimals) {
  const text = String(value || "");
  if (!DECIMAL.test(text) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Invalid token amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Use no more than ${decimals} decimal places for this token.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function matchesWatch(event, watch, decimals) {
  if (watch.wallet && event.from.toLowerCase() !== watch.wallet && event.to.toLowerCase() !== watch.wallet) return false;
  return decimalToUnits(event.amount, decimals) >= decimalToUnits(watch.minimum, decimals);
}

const BOT_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
const CHAT_ID = /^(?:-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
const TG_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const AMOUNT = /^\d{1,30}(?:\.\d{1,36})?$/;
const EXPLORER = "https://www.pharosscan.xyz";
const WORKER_PUBLIC_URL = "https://pharos-on-chain-alert-bot.rajdeb1803.workers.dev";
const SAMPLE_TOKEN_ADDRESS = "0xC879C018dB60520F4355C26eD1a6D572cdAC1815";

function validateTelegramCredentials(token, chatId) {
  const botToken = String(token || "").trim();
  const destination = String(chatId || "").trim();
  if (!BOT_TOKEN.test(botToken)) throw new Error("Enter a valid Telegram bot token from @BotFather.");
  if (!CHAT_ID.test(destination)) throw new Error("Enter a valid Telegram chat ID or public channel username.");
  return { botToken, chatId: destination };
}

function buildTelegramMessage(event, threshold) {
  if (!event || typeof event !== "object") throw new Error("Alert event is missing.");
  const tx = String(event.tx || "");
  const from = String(event.from || "");
  const to = String(event.to || "");
  const token = String(event.token || "");
  const amount = String(event.amount || "");
  const minimum = String(threshold || "");
  const block = Number(event.block);
  const logIndex = Number(event.logIndex);
  const kind = ["TRANSFER", "MINT", "BURN"].includes(event.kind) ? event.kind : "TRANSFER";

  if (!HASH.test(tx) || !TG_ADDRESS.test(from) || !TG_ADDRESS.test(to) || !TG_ADDRESS.test(token)) throw new Error("Event addresses or transaction hash are invalid.");
  if (!AMOUNT.test(amount) || !AMOUNT.test(minimum)) throw new Error("Transfer amount or alert threshold is invalid.");
  if (!Number.isSafeInteger(block) || block < 0 || !Number.isSafeInteger(logIndex) || logIndex < 0) throw new Error("Event block data is invalid.");

  const symbol = safeSymbol(event.symbol);
  const id = `1672:${tx.toLowerCase()}:${logIndex}`;
  const explorer = `${EXPLORER}/tx/${tx}`;
  return [
    `🔔 <b>Pharos ${kind.toLowerCase()} alert</b>`,
    `Transfer: <b>${amount} ${symbol}</b>`,
    `Minimum: ${minimum} ${symbol}`,
    `From: <code>${from}</code>`,
    `To: <code>${to}</code>`,
    `Token: <code>${token}</code>`,
    `Block: ${block}`,
    `<a href="${explorer}">View transaction on PharosScan</a>`,
    `Event ID: <code>${id}</code>`,
  ].join("\n");
}


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
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Remote service request failed: " + response.status);
  const data = await response.json();
  if (data.error || data.ok === false) throw new Error("Remote service returned an error: " + (data.error_code || "unknown"));
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

function startText() {
  return [
    "Pharos On-Chain Alert Bot",
    "QUICK START",
    "/sample — watch Pharos USDC transfers of at least 1 USDC",
    `Sample token address: ${SAMPLE_TOKEN_ADDRESS}`,
    `Custom watch: /watch ${SAMPLE_TOKEN_ADDRESS} 1 [wallet-address]`,
    "Replace the token address and minimum with your own values.",
    "The minimum uses normal token units: 1 means 1 USDC.",
    "Optional wallet filter: alert only if that wallet sends or receives the token.",
    "COMMANDS",
    "/watch <token-address> <minimum> [wallet-address] — start a custom watch",
    "/status — show the active token, minimum, and last scanned block",
    "/pause — stop the current watch",
    "TIMING",
    "Command replies are immediate. Pharos is scanned once per minute, so transfer alerts may take up to a minute.",
    "The first scan sets a baseline. Only later matching transfers alert; past transfers are not replayed.",
    "Read-only bot: no wallet connection or private key is needed.",
  ].join("\n");
}

async function getState(db) {
  return db.prepare("SELECT * FROM bot_state WHERE id = 1").first();
}

async function processUpdate(env, credentials, update) {
  const latest = await getState(env.DB);
  if (!Number.isInteger(update?.update_id) || update.update_id < (Number(latest?.telegram_offset) || 0)) return;
    const message = update.message;
    if (message && typeof message.text === "string") {
      const text = message.text.trim();
      const command = text.split(/\s+/, 1)[0].split("@")[0].toLowerCase();
      const actualChatId = String(message.chat?.id || "");
      if (command === "/start" && actualChatId !== credentials.chatId && message.chat?.type === "private") {
        await sendMessage(credentials.botToken, actualChatId, `The bot is online, but this chat is not configured yet. Set TELEGRAM_CHAT_ID to ${actualChatId} in the Cloudflare Worker secrets, then send /start again.`);
      } else if (actualChatId === credentials.chatId && command === "/start") {
        await sendMessage(credentials.botToken, credentials.chatId, startText());
      } else if (actualChatId === credentials.chatId && command === "/sample") {
        await env.DB.prepare("UPDATE bot_state SET token = ?, minimum = ?, wallet = NULL, last_block = NULL, symbol = NULL, decimals = NULL WHERE id = 1")
          .bind(SAMPLE_TOKEN_ADDRESS, "1").run();
        await sendMessage(credentials.botToken, credentials.chatId, "Sample watch set for Pharos USDC (minimum 1 USDC). The next scan sets the baseline; new matching transfers are checked once per minute.");
      } else if (actualChatId === credentials.chatId && command === "/watch") {
        const watch = parseWatchCommand(text);
        if (!watch) {
          await sendMessage(credentials.botToken, credentials.chatId, `Usage: /watch <token-address> <minimum-token-amount> [wallet-address]. The minimum is a token amount, not a time interval. Example: /watch ${SAMPLE_TOKEN_ADDRESS} 1. Use /sample for a quick test.`);
        } else {
          await env.DB.prepare("UPDATE bot_state SET token = ?, minimum = ?, wallet = ?, last_block = NULL WHERE id = 1")
            .bind(watch.token, watch.minimum, watch.wallet || null).run();
          await sendMessage(credentials.botToken, credentials.chatId, `Watch set for ${watch.token}; minimum ${watch.minimum}${watch.wallet ? `; wallet ${watch.wallet}` : ""}. The next scan sets a live baseline.`);
        }
      } else if (actualChatId === credentials.chatId && command === "/pause") {
        await env.DB.prepare("UPDATE bot_state SET token = NULL, minimum = NULL, wallet = NULL, last_block = NULL, symbol = NULL, decimals = NULL WHERE id = 1").run();
        await sendMessage(credentials.botToken, credentials.chatId, "Monitoring paused.");
      } else if (actualChatId === credentials.chatId && command === "/status") {
        const latest = await getState(env.DB);
        await sendMessage(credentials.botToken, credentials.chatId, latest.token
          ? `Monitoring active.\nToken: ${latest.token}\nMinimum: ${latest.minimum}\nWallet filter: ${latest.wallet || "none"}\nLast block: ${latest.last_block ?? "baseline pending"}`
          : "Monitoring is paused. Use /watch <token-address> <minimum> [wallet-address] to start.");
      } else if (actualChatId === credentials.chatId) {
        await sendMessage(credentials.botToken, credentials.chatId, "Unknown command. Send /start for instructions.");
      }
    }

  await env.DB.prepare("UPDATE bot_state SET telegram_offset = ? WHERE id = 1").bind(update.update_id + 1).run();
}

async function processUpdates(env, credentials, state) {
  const updates = await telegram(credentials.botToken, "getUpdates", {
    offset: Number(state.telegram_offset) || 0,
    limit: 100,
    timeout: 0,
    allowed_updates: ["message"],
  });
  for (const update of updates) await processUpdate(env, credentials, update);
}

async function webhookSecret(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureWebhook(credentials, env) {
  const url = `${WORKER_PUBLIC_URL}/telegram/webhook`;
  const current = await telegram(credentials.botToken, "getWebhookInfo");
  if (current.url === url) return true;
  await telegram(credentials.botToken, "setWebhook", {
    url,
    secret_token: await webhookSecret(credentials.botToken),
    allowed_updates: ["message"],
    max_connections: 1,
  });
  return true;
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
    const webhookReady = await ensureWebhook(credentials, env).catch((error) => {
      console.error("Telegram webhook setup failed.", error?.name || "Error");
      return false;
    });
    if (!webhookReady) await processUpdates(env, credentials, await getState(env.DB));
    await scanChain(env, credentials);
  } finally {
    await env.DB.prepare("UPDATE bot_state SET locked_until = 0 WHERE id = 1").run();
  }
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(scheduledRun(env).catch(() => console.error("Scheduled Pharos alert run failed.")));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/telegram/webhook") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      try {
        const credentials = validateTelegramCredentials(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
        const expected = await webhookSecret(credentials.botToken);
        if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        await env.DB.prepare("INSERT OR IGNORE INTO bot_state (id) VALUES (1)").run();
        await processUpdate(env, credentials, await request.json());
        return new Response("ok");
      } catch (error) {
        console.error("Telegram webhook update failed.", error?.name || "Error");
        return new Response("Temporary update processing failure", { status: 500 });
      }
    }

    let bot = "Telegram bot";
    let telegramStatus = "not_configured";
    try {
      const credentials = validateTelegramCredentials(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
      telegramStatus = "checking";
      const me = await telegram(credentials.botToken, "getMe");
      if (me.username) bot = `@${me.username}`;
      telegramStatus = me.username ? "connected" : "telegram_response_incomplete";
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("valid Telegram bot token")) telegramStatus = "invalid_token_format";
      else if (message.includes("valid Telegram chat ID")) telegramStatus = "invalid_chat_id_format";
      else if (message.includes("401")) telegramStatus = "telegram_rejected_token";
      else if (message.includes("404")) telegramStatus = "telegram_endpoint_error";
      else if (message.includes("429")) telegramStatus = "telegram_rate_limited";
      else {
        const statusCode = message.match(/(?:failed: |error: )(\d{3})/)?.[1];
        if (statusCode) telegramStatus = "telegram_http_" + statusCode;
        else if (error?.name === "TimeoutError" || error?.name === "AbortError") telegramStatus = "telegram_timeout";
        else if (error?.name === "TypeError") telegramStatus = "telegram_network_error";
        else telegramStatus = "telegram_request_failed";
      }
    }
    return Response.json({ service: "Pharos On-Chain Alert Bot", bot, telegramStatus, commands: ["/watch", "/sample", "/pause", "/status"], scanInterval: "1 minute" });
  },
};
