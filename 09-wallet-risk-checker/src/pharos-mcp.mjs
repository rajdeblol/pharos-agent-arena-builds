import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CIRCLE_USDC,
  assessWallet,
  decodeBool,
  extractApproval,
  getAddressTopic,
  isValidAddress,
} from "./risk.mjs";

export const PHAROS_MCP_URL = process.env.PHAROS_MCP_URL || "https://mcp.pharos.xyz/mcp";
const REQUEST_TIMEOUT_MS = 5_000;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const PROXY_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const PROXY_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

function parseResult(result, toolName) {
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (result.isError) throw new Error(text || `${toolName} returned an error.`);
  if (result.structuredContent) return result.structuredContent;
  if (!text) throw new Error(`${toolName} returned no data.`);
  try { return JSON.parse(text); }
  catch { return text; }
}

async function callTool(client, name, args = {}) {
  return parseResult(await client.callTool({ name, arguments: args }, undefined, { timeout: REQUEST_TIMEOUT_MS }), name);
}

function nestedValue(value, keys, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value) || typeof value !== "object") return value;
  for (const key of keys) if (Object.hasOwn(value, key)) return nestedValue(value[key], keys, depth + 1);
  if (Object.hasOwn(value, "result")) return nestedValue(value.result, keys, depth + 1);
  return value;
}

function quantity(value, label) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^(?:0x[\da-f]+|\d+)$/i.test(value)) return BigInt(value);
  throw new Error(`Pharos Chain MCP returned an invalid ${label}.`);
}

function hexQuantity(value) {
  return `0x${value.toString(16)}`;
}

function extractHex(value, keys, label) {
  const candidate = nestedValue(value, keys);
  if (typeof candidate !== "string" || !/^0x[\da-f]*$/i.test(candidate)) {
    throw new Error(`Pharos Chain MCP returned invalid ${label}.`);
  }
  return candidate;
}

async function withLimit(items, limit, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function chunksForRange(head, lookback) {
  const first = head >= BigInt(lookback - 1) ? head - BigInt(lookback - 1) : 0n;
  const chunks = [];
  for (let start = first; start <= head; start += 1000n) {
    const end = start + 999n < head ? start + 999n : head;
    chunks.push({ fromBlock: hexQuantity(start), toBlock: hexQuantity(end) });
  }
  return chunks;
}

function unwrapLogs(value) {
  const logs = nestedValue(value, ["logs", "items"]);
  return Array.isArray(logs) ? logs : [];
}

function approvalAllowanceCall(owner, spender) {
  return `0xdd62ed3e${getAddressTopic(owner).slice(2)}${getAddressTopic(spender).slice(2)}`;
}

function contractImplementation(code, implementationSlot) {
  if (typeof implementationSlot === "string" && /^0x0*[1-9a-f]/i.test(implementationSlot)) {
    return `0x${implementationSlot.slice(-40)}`;
  }
  const minimalProxy = code.match(/363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i);
  return minimalProxy ? `0x${minimalProxy[1].toLowerCase()}` : null;
}

export async function createPharosClient(url = PHAROS_MCP_URL) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
    throw new Error("Pharos Chain MCP must use HTTPS.");
  }
  const client = new Client({ name: "pharos-wallet-risk-checker", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint), { timeout: REQUEST_TIMEOUT_MS });
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function scanAddress(input, { clientFactory = createPharosClient, lookback = 1000 } = {}) {
  const address = typeof input === "string" && input.trim().toUpperCase() === "USDC"
    ? CIRCLE_USDC
    : typeof input === "string" ? input.trim() : "";
  if (!isValidAddress(address)) throw new Error("Enter a valid Pharos address or use the USDC preset.");
  const normalizedLookback = Number(lookback);
  if (![1000, 3000, 5000].includes(normalizedLookback)) throw new Error("Choose a lookback of 1,000, 3,000, or 5,000 blocks.");

  const client = await clientFactory();
  try {
    const headResult = await callTool(client, "get_block_number");
    const head = quantity(nestedValue(headResult, ["blockNumber", "number", "height"]), "block number");
    const blockTag = hexQuantity(head);
    const paddedAddress = getAddressTopic(address);
    const [codeResult, balanceResult, nonceResult, blacklistResult] = await Promise.all([
      callTool(client, "get_code", { address, block: blockTag }),
      callTool(client, "get_balance", { address, block: blockTag }),
      callTool(client, "get_transaction_count", { address, block: blockTag }),
      callTool(client, "eth_call", { transaction: { to: CIRCLE_USDC, data: `0xfe575a87${paddedAddress.slice(2)}` }, block: blockTag })
        .catch(() => null),
    ]);
    const code = extractHex(codeResult, ["code", "bytecode", "value"], "contract bytecode");
    const balance = nestedValue(balanceResult, ["balanceWei", "balanceHex", "balance", "value"]);
    const nonce = nestedValue(nonceResult, ["transactionCount", "nonce", "count", "value"]);
    const blacklist = blacklistResult == null ? null : decodeBool(nestedValue(blacklistResult, ["value", "result", "data"]));
    const isContract = code.length > 2 && !/^0x0*$/.test(code);

    const optionalReads = isContract ? await Promise.all([
      callTool(client, "eth_call", { transaction: { to: address, data: "0x5c975abb" }, block: blockTag }).catch(() => null),
      callTool(client, "get_storage_at", { address, position: PROXY_IMPLEMENTATION_SLOT, block: blockTag }).catch(() => null),
      callTool(client, "get_storage_at", { address, position: PROXY_ADMIN_SLOT, block: blockTag }).catch(() => null),
    ]) : [null, null, null];
    const paused = optionalReads[0] == null ? null : decodeBool(nestedValue(optionalReads[0], ["value", "result", "data"]));
    const implementationSlot = optionalReads[1] == null ? null : nestedValue(optionalReads[1], ["value", "result", "data", "storage"]);
    const adminSlot = optionalReads[2] == null ? null : nestedValue(optionalReads[2], ["value", "result", "data", "storage"]);
    const implementation = contractImplementation(code, implementationSlot);
    const proxyAdmin = typeof adminSlot === "string" && /^0x0*[1-9a-f]/i.test(adminSlot) ? `0x${adminSlot.slice(-40)}` : null;

    const ranges = chunksForRange(head, normalizedLookback);
    const queries = ranges.flatMap((range) => [
      { ...range, event: "transfer-out", topics: [TRANSFER_TOPIC, paddedAddress] },
      { ...range, event: "transfer-in", topics: [TRANSFER_TOPIC, null, paddedAddress] },
      { ...range, event: "approval", topics: [APPROVAL_TOPIC, paddedAddress] },
    ]);
    let historyAvailable = true;
    const logResults = await withLimit(queries, 6, async (query) => {
      try {
        const result = await callTool(client, "get_logs", {
          address: CIRCLE_USDC,
          topics: query.topics,
          fromBlock: query.fromBlock,
          toBlock: query.toBlock,
        });
        return { event: query.event, logs: unwrapLogs(result) };
      } catch {
        historyAvailable = false;
        return { event: query.event, logs: [] };
      }
    });

    const transferLogs = logResults.filter((item) => item.event.startsWith("transfer")).flatMap((item) => item.logs);
    const transferMap = new Map();
    for (const log of transferLogs) {
      const direction = itemDirection(log, address);
      if (direction) transferMap.set(`${log.transactionHash || log.blockNumber}:${log.logIndex ?? "0"}`, { direction });
    }
    const approvalLogs = logResults.filter((item) => item.event === "approval").flatMap((item) => item.logs);
    const latestApprovalBySpender = new Map();
    for (const log of approvalLogs) {
      const approval = extractApproval(log);
      if (approval) {
        const existing = latestApprovalBySpender.get(approval.spender);
        if (!existing || BigInt(log.blockNumber || "0x0") > BigInt(existing.blockNumber || "0x0")) {
          latestApprovalBySpender.set(approval.spender, { ...approval, blockNumber: log.blockNumber || "0x0" });
        }
      }
    }

    const spenders = [...latestApprovalBySpender.keys()].slice(0, 5);
    const approvalResults = await Promise.all(spenders.map(async (spender) => {
      try {
        const result = await callTool(client, "eth_call", {
          transaction: { to: CIRCLE_USDC, data: approvalAllowanceCall(address, spender) },
          block: blockTag,
        });
        return { spender, allowance: nestedValue(result, ["value", "result", "data"]) };
      } catch {
        historyAvailable = false;
        return null;
      }
    }));
    const approvals = approvalResults.filter(Boolean);
    const transfers = [...transferMap.values()];
    const report = assessWallet({
      address,
      blockNumber: Number(head),
      bytecode: code,
      balance,
      nonce,
      transfers,
      approvals,
      blacklist,
      paused,
      implementation,
      lookback: normalizedLookback,
      historyAvailable,
    });
    report.snapshotBlock = blockTag;
    report.proxyAdmin = proxyAdmin;
    report.metrics.recentUsdcTransfers = transfers.length.toLocaleString();
    return report;
  } finally {
    await client.close().catch(() => {});
  }
}

function itemDirection(log, address) {
  const sender = `0x${String(log?.topics?.[1] || "").slice(-40).toLowerCase()}`;
  const recipient = `0x${String(log?.topics?.[2] || "").slice(-40).toLowerCase()}`;
  const target = address.toLowerCase();
  if (sender === target && recipient === target) return "self";
  if (sender === target) return "out";
  if (recipient === target) return "in";
  return null;
}
