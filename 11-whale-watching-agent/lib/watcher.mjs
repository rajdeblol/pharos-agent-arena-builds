import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const PHAROS_MCP_URL = process.env.PHAROS_MCP_URL || "https://mcp.pharos.xyz/mcp";
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const DEFAULT_ADDRESSES = [
  { address: "0x912c9aDe24D44d8922f0866D8Dcb079f1363f647", label: "Busiest USDC/WPROS flow" },
  { address: "0x936564245B69f5a293b42cbd752E0eE3bb68b470", label: "Second-busiest flow" },
  { address: "0x768B959191cE5876cabBbC014a08D72615BDdE54", label: "Frequent USDC trader" },
  { address: "0xB53F6cB429B8e14b6b87362B5a20Ba69FC9C3B47", label: "Large USDC round-trips" },
  { address: "0xA1204366ce65678872ece7F7a9eDEFe858574777", label: "Large USDC round-trips" },
  { address: "0x7927d0297e903A2AaDf617760F17a975034d0C10", label: "Large USDC round-trips" },
  { address: "0xf48Ff1e0aBc740C167049c46435E753b083bC317", label: "Active WPROS flow" },
  { address: "0x4146D192Da6428c9e1C243D2A953c625B5765623", label: "WPROS seller" },
];
export const TOKENS = [
  { symbol: "USDC", address: "0xc879c018db60520f4355c26ed1a6d572cdac1815", decimals: 6 },
  { symbol: "WPROS", address: "0x52c48d4213107b20bc583832b0d951fb9ca8f0b0", decimals: 18 },
];

function amountUnits(value, decimals) {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole || "0") * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function parseToolResult(result, tool) {
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (result.isError) throw new Error(text || `${tool} returned an error.`);
  if (result.structuredContent) return result.structuredContent;
  try { return JSON.parse(text); } catch { throw new Error(`${tool} returned invalid data.`); }
}

async function call(client, tool, args = {}) {
  return parseToolResult(await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 12_000 }), tool);
}

function nested(value, keys) {
  for (let depth = 0; depth < 4 && value && typeof value === "object"; depth++) {
    const key = keys.find((item) => Object.hasOwn(value, item));
    if (key) value = value[key];
    else if (Object.hasOwn(value, "result")) value = value.result;
    else break;
  }
  return value;
}

function parseBlock(value) {
  const block = nested(value, ["blockNumber", "number", "height"]);
  const result = typeof block === "string" && /^0x/i.test(block) ? Number(BigInt(block)) : Number(block);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Pharos returned an invalid block number.");
  return result;
}

function logsFrom(value) {
  const logs = nested(value, ["logs", "items"]);
  return Array.isArray(logs) ? logs : [];
}

async function getLogsPaged(client, token, fromBlock, toBlock, topics) {
  try {
    return logsFrom(await call(client, "get_logs", { address: token.address, topics, fromBlock, toBlock }));
  } catch (error) {
    if (fromBlock >= toBlock || !/too many|result limit|response.{0,12}(too |size)|exceeded|payload|max logs|query returned more/i.test(error.message)) throw error;
    const midpoint = fromBlock + Math.floor((toBlock - fromBlock) / 2);
    const [left, right] = await Promise.all([
      getLogsPaged(client, token, fromBlock, midpoint, topics),
      getLogsPaged(client, token, midpoint + 1, toBlock, topics),
    ]);
    return [...left, ...right];
  }
}

function cleanWatchlist(input) {
  const supplied = Array.isArray(input.addresses) ? input.addresses : [];
  const addresses = (supplied.length ? supplied : DEFAULT_ADDRESSES).map((item, index) => {
    const address = String(item.address ?? "").trim();
    if (!/^0x[\da-f]{40}$/i.test(address)) throw new Error(`Address ${index + 1} is not a valid EVM address.`);
    const label = String(item.label ?? "").trim().slice(0, 48) || `Wallet ${index + 1}`;
    return { address, label };
  });
  const unique = new Map(addresses.map((item) => [item.address.toLowerCase(), item]));
  if (unique.size < 1) throw new Error("Add at least one wallet address.");
  if (unique.size > 20) throw new Error("Track up to 20 wallet addresses at a time.");
  const thresholds = {};
  for (const token of TOKENS) {
    const value = String(input.thresholds?.[token.symbol] ?? (token.symbol === "USDC" ? "50" : "20")).trim();
    if (!new RegExp(`^\\d+(?:\\.\\d{1,${token.decimals}})?$`).test(value)) throw new Error(`${token.symbol} threshold must be a non-negative number with up to ${token.decimals} decimal places.`);
    thresholds[token.symbol] = value;
  }
  const lookback = Number(input.lookback ?? 5000);
  if (![1000, 5000, 10000].includes(lookback)) throw new Error("Choose a history window of 1,000, 5,000, or 10,000 blocks.");
  return { addresses: [...unique.values()], thresholds, lookback };
}

function topicAddress(topic) {
  return `0x${String(topic || "").slice(-40)}`.toLowerCase();
}

function decode(log, token) {
  if (!Array.isArray(log.topics) || log.topics.length < 3 || String(log.topics[0]).toLowerCase() !== TRANSFER_TOPIC) return null;
  return {
    from: topicAddress(log.topics[1]),
    to: topicAddress(log.topics[2]),
    raw: BigInt(log.data || "0x0"),
    block: Number(BigInt(log.blockNumber || "0x0")),
    tx: log.transactionHash,
    logIndex: Number(BigInt(log.logIndex || "0x0")),
    symbol: token.symbol,
    decimals: token.decimals,
  };
}

function human(raw, decimals, places = 2) {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = (raw % divisor).toString().padStart(decimals, "0").slice(0, places).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function balanceValue(value) {
  const result = nested(value, ["balanceWei", "balanceHex", "result", "balance"]);
  if (result === undefined || result === null || result === "") throw new Error("Balance response was empty.");
  return BigInt(result);
}

async function readHoldings(client, wallet, block) {
  const tokenCalls = TOKENS.map(async (token) => {
    const data = `0x70a08231${wallet.address.slice(2).toLowerCase().padStart(64, "0")}`;
    const raw = balanceValue(await call(client, "eth_call", { transaction: { to: token.address, data }, block }));
    return [token.symbol, human(raw, token.decimals, 4)];
  });
  const nativeCall = call(client, "get_balance", { address: wallet.address, block }).then((result) => human(balanceValue(result), 18, 4));
  const [tokens, native] = await Promise.all([Promise.all(tokenCalls), nativeCall]);
  return { tokens: Object.fromEntries(tokens), native };
}

export function explain(event, watched, labels, threshold) {
  const counterpartAddress = event.direction === "OUT" ? event.to : event.from;
  const counterpart = labels.get(counterpartAddress) || counterpartAddress;
  const rawThreshold = amountUnits(threshold, event.decimals);
  const ratio = rawThreshold > 0n ? event.raw / rawThreshold : 0n;
  const context = [];
  if (ratio >= 2n) context.push(`${ratio}× the configured threshold`);
  else context.push(`above the ${threshold} ${event.symbol} threshold`);
  if (labels.has(event.from) && labels.has(event.to)) context.push("both wallets are on your watchlist");
  if (/^0x0{40}$/i.test(event.from)) context.push("new tokens were minted");
  if (/^0x0{40}$/i.test(event.to)) context.push("tokens were burned");
  return `${watched.label} ${event.direction === "OUT" ? "sent" : "received"} ${event.amount} ${event.symbol} ${event.direction === "OUT" ? "to" : "from"} ${counterpart}. This matters because it is ${context.join(" and ")}.`;
}

export async function scanWhales(input, clientFactory = async () => {
  const client = new Client({ name: "pharos-whale-watching-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(PHAROS_MCP_URL)), { timeout: 12_000 });
  return client;
}) {
  const config = cleanWatchlist(input);
  const client = await clientFactory();
  try {
    const head = parseBlock(await call(client, "get_block_number"));
    const start = Math.max(0, Number.isSafeInteger(Number(input.fromBlock)) ? Number(input.fromBlock) : head - config.lookback + 1);
    const chunks = [];
    for (let from = start; from <= head; from += 1000) chunks.push({ fromBlock: from, toBlock: Math.min(head, from + 999) });
    const topicsFor = (addresses) => addresses.length ? addresses.map(({ address }) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`) : [];
    const watchedTopics = topicsFor(config.addresses);
    const allLogs = await Promise.all(TOKENS.flatMap((token) => chunks.flatMap((chunk) => [
      { token, chunk, topics: [TRANSFER_TOPIC, watchedTopics] },
      { token, chunk, topics: [TRANSFER_TOPIC, null, watchedTopics] },
    ].map(async ({ topics, ...item }) => ({
      ...item,
      logs: await getLogsPaged(client, token, chunk.fromBlock, chunk.toBlock, topics),
    })))));
    const addresses = new Map(config.addresses.map((item) => [item.address.toLowerCase(), item]));
    const events = [];
    const activity = [];
    const seenLogs = new Set();
    for (const result of allLogs) for (const log of result.logs) {
      const decoded = decode(log, result.token);
      if (!decoded) continue;
      const logKey = `${decoded.tx}:${decoded.logIndex}`;
      if (seenLogs.has(logKey)) continue;
      seenLogs.add(logKey);
      const from = addresses.get(decoded.from);
      const to = addresses.get(decoded.to);
      if (!from && !to) continue;
      for (const [wallet, direction] of [[from, "OUT"], [to, "IN"]]) {
        if (wallet) activity.push({ id: `${logKey}:${wallet.address.toLowerCase()}:${direction}`, wallet: wallet.address, symbol: decoded.symbol, direction, raw: decoded.raw.toString(), block: decoded.block });
      }
      const threshold = config.thresholds[decoded.symbol];
      const minimum = amountUnits(threshold, decoded.decimals);
      if (decoded.raw < minimum) continue;
      const amount = human(decoded.raw, decoded.decimals, 4);
      for (const [wallet, direction] of [[from, "OUT"], [to, "IN"]]) {
        if (!wallet) continue;
        events.push({
          id: `${decoded.tx}:${decoded.logIndex}:${direction}:${wallet.address.toLowerCase()}`,
          block: decoded.block, tx: decoded.tx, logIndex: decoded.logIndex, symbol: decoded.symbol,
          amount, raw: decoded.raw.toString(), direction, kind: /^0x0{40}$/i.test(decoded.from) ? "MINT" : /^0x0{40}$/i.test(decoded.to) ? "BURN" : "TRANSFER",
          from: decoded.from, to: decoded.to, wallet: wallet.address, label: wallet.label,
          explanation: explain({ ...decoded, amount, direction }, wallet, new Map(config.addresses.map((item) => [item.address.toLowerCase(), item.label])), threshold),
          threshold,
        });
      }
    }
    events.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
    const holdings = input.includeBalances === false ? [] : await Promise.all(config.addresses.map(async (wallet) => {
      try { return [wallet.address.toLowerCase(), await readHoldings(client, wallet, head)]; }
      catch { return [wallet.address.toLowerCase(), null]; }
    }));
    const holdingMap = new Map(holdings);
    const summary = config.addresses.map((wallet) => {
      const walletActivity = activity.filter((item) => item.wallet.toLowerCase() === wallet.address.toLowerCase());
      const byToken = Object.fromEntries(TOKENS.map((token) => {
        const tokenActivity = walletActivity.filter((item) => item.symbol === token.symbol);
        const incoming = tokenActivity.filter((item) => item.direction === "IN").reduce((sum, item) => sum + BigInt(item.raw), 0n);
        const outgoing = tokenActivity.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + BigInt(item.raw), 0n);
        return [token.symbol, { in: human(incoming, token.decimals), out: human(outgoing, token.decimals), hold: holdingMap.get(wallet.address.toLowerCase())?.tokens?.[token.symbol] ?? "—", count: tokenActivity.length }];
      }));
      const walletMoves = events.filter((item) => item.wallet.toLowerCase() === wallet.address.toLowerCase());
      const largest = walletMoves.reduce((top, item) => !top || BigInt(item.raw) > BigInt(top.raw) ? item : top, null);
      return { ...wallet, count: walletActivity.length, significantCount: walletMoves.length, byToken, nativeHold: holdingMap.get(wallet.address.toLowerCase())?.native ?? "—", largest: largest ? { amount: largest.amount, symbol: largest.symbol, direction: largest.direction, block: largest.block } : null };
    });
    return { chainId: 1672, fromBlock: start, toBlock: head, lookback: config.lookback, scannedTokens: TOKENS.map(({ symbol }) => symbol), watchlist: config.addresses, thresholds: config.thresholds, eventCount: events.length, activity, events: events.slice(0, 250), summary };
  } finally {
    await client.close().catch(() => {});
  }
}

export { cleanWatchlist };
