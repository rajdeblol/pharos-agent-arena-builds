const BOT_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
const CHAT_ID = /^(?:-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const AMOUNT = /^\d{1,30}(?:\.\d{1,36})?$/;
const EXPLORER = "https://www.pharosscan.xyz";

export function validateTelegramCredentials(token, chatId) {
  const botToken = String(token || "").trim();
  const destination = String(chatId || "").trim();
  if (!BOT_TOKEN.test(botToken)) throw new Error("Enter a valid Telegram bot token from @BotFather.");
  if (!CHAT_ID.test(destination)) throw new Error("Enter a valid Telegram chat ID or public channel username.");
  return { botToken, chatId: destination };
}

function safeSymbol(value) {
  return String(value || "TOKEN").replace(/[^a-zA-Z0-9._$-]/g, "").slice(0, 18) || "TOKEN";
}

export function buildTelegramMessage(event, threshold) {
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

  if (!HASH.test(tx) || !ADDRESS.test(from) || !ADDRESS.test(to) || !ADDRESS.test(token)) throw new Error("Event addresses or transaction hash are invalid.");
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
