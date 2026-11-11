import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.PHAROS_MCP_URL || "https://mcp.pharos.xyz/mcp";
const EXPLORER = "https://www.pharosscan.xyz";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEFAULT_TOKEN = "0xc879c018db60520f4355c26ed1a6d572cdac1815";
const ZERO = "0x0000000000000000000000000000000000000000";

function address(value) {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error("Paste a valid 0x contract address (40 hex characters).");
  return value;
}

async function jsonTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const body = result.content?.find((part) => part.type === "text")?.text;
  if (result.isError) throw new Error(body || `${name} failed on Chain MCP.`);
  if (!body) throw new Error(`${name} returned no data.`);
  return JSON.parse(body);
}

function decodeText(hex) {
  const data = hex.slice(2);
  if (!/^[a-f0-9]+$/i.test(data) || data.length < 64) return "—";
  let offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
  if (!Number.isSafeInteger(offset) || offset < 64 || offset + 64 > data.length) offset = 0;
  const length = offset === 0 ? 32 : Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
  const start = offset === 0 ? 0 : offset + 64;
  const bytes = data.slice(start, start + Math.min(length, 128) * 2).match(/.{2}/g)?.map((n) => Number.parseInt(n, 16)) || [];
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0+$/, "").trim() || "—";
}

async function tokenInfo(client, token) {
  const calls = [
    ["symbol", "0x95d89b41"],
    ["decimals", "0x313ce567"],
  ];
  const values = await Promise.all(calls.map(async ([name, data]) => {
    const result = await jsonTool(client, "eth_call", { transaction: { to: token, data } });
    return [name, result.result];
  }));
  const raw = Object.fromEntries(values);
  const decimals = Number(BigInt(raw.decimals));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Token decimals are outside the supported range.");
  return { symbol: decodeText(raw.symbol), decimals };
}

function decodeLog(log, decimals, symbol) {
  if (!Array.isArray(log.topics) || log.topics.length < 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) return null;
  const from = `0x${log.topics[1].slice(-40)}`;
  const to = `0x${log.topics[2].slice(-40)}`;
  const amount = BigInt(log.data || "0x0");
  const scale = 10n ** BigInt(decimals);
  const whole = (amount / scale).toString();
  const fraction = decimals ? (amount % scale).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  const kind = from.toLowerCase() === ZERO ? "MINT" : to.toLowerCase() === ZERO ? "BURN" : "TRANSFER";
  const tx = log.transactionHash;
  return {
    id: `${tx}:${Number(BigInt(log.logIndex))}`,
    block: Number(BigInt(log.blockNumber)),
    logIndex: Number(BigInt(log.logIndex)),
    tx,
    from,
    to,
    amount: `${whole}${fraction ? `.${fraction}` : ""}`,
    symbol,
    kind,
    explorer: `${EXPLORER}/tx/${tx}`,
  };
}

async function readLogs(client, token, fromBlock, toBlock) {
  const calls = [];
  for (let start = fromBlock; start <= toBlock; start += 1000) {
    calls.push({ fromBlock: start, toBlock: Math.min(start + 999, toBlock) });
  }
  const pages = await Promise.all(calls.map((range) => jsonTool(client, "get_logs", {
    address: token,
    topics: [TRANSFER_TOPIC],
    fromBlock: range.fromBlock,
    toBlock: range.toBlock,
  })));
  return pages.flat();
}

export async function readEvents({ token = DEFAULT_TOKEN, lookback = 200, since } = {}) {
  token = address(token);
  lookback = Math.max(1, Math.min(2000, Number(lookback) || 200));
  const client = new Client({ name: "pharos-event-log-monitor", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));
    const [chain, head, info] = await Promise.all([
      jsonTool(client, "get_chain_info"),
      jsonTool(client, "get_block_number"),
      tokenInfo(client, token),
    ]);
    const latest = Number(head.blockNumber);
    const sinceBlock = since == null ? null : Number(since);
    const from = sinceBlock === null || !Number.isFinite(sinceBlock)
      ? Math.max(0, latest - lookback + 1)
      : Math.max(0, Math.min(latest, sinceBlock - 5));
    const logs = from <= latest ? await readLogs(client, token, from, latest) : [];
    const unique = new Map();
    for (const log of logs) {
      const event = decodeLog(log, info.decimals, info.symbol);
      if (event) unique.set(event.id, event);
    }
    const events = [...unique.values()].sort((a, b) => b.block - a.block || b.logIndex - a.logIndex).slice(0, 250);
    return {
      network: chain.name || "Pharos Mainnet",
      chainId: Number(chain.chainId),
      head: latest,
      from,
      token,
      symbol: info.symbol,
      decimals: info.decimals,
      events,
      checkedAt: new Date().toISOString(),
      via: "Pharos Chain MCP",
      explorer: `${EXPLORER}/address/${token}`,
    };
  } finally {
    await client.close().catch(() => {});
  }
}
