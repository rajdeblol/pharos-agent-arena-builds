import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { analyzeTransaction, buildReplayRequest, transactionHashIsValid } from "./analysis.mjs";

export const PHAROS_MCP_URL = process.env.PHAROS_MCP_URL || "https://mcp.pharos.xyz/mcp";
const REQUEST_TIMEOUT_MS = 7_000;

function parseToolResult(result, toolName) {
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (result.isError) {
    let message = text || `${toolName} returned an error.`;
    try { message = JSON.parse(text || "{}").error?.message || message; } catch {}
    throw new Error(message);
  }
  if (result.structuredContent) return result.structuredContent;
  if (!text) throw new Error(`${toolName} returned no data.`);
  try { return JSON.parse(text); }
  catch { throw new Error(`${toolName} returned unreadable data.`); }
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: REQUEST_TIMEOUT_MS });
  return parseToolResult(result, name);
}

function unwrap(value, preferredKey) {
  let current = value;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    if (preferredKey && Object.hasOwn(current, preferredKey)) current = current[preferredKey];
    else if (Object.hasOwn(current, "result")) current = current.result;
    else break;
  }
  return current;
}

function errorText(error) {
  const message = error?.message || String(error || "");
  const data = error?.data ?? error?.error?.data ?? error?.cause?.data;
  return `${message}${typeof data === "string" ? ` ${data}` : ""}`.slice(0, 800);
}

export async function createPharosClient(url = PHAROS_MCP_URL) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
    throw new Error("Pharos Chain MCP must use HTTPS.");
  }
  const client = new Client({ name: "pharos-dapp-support-agent", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint), { timeout: REQUEST_TIMEOUT_MS });
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function investigateTransaction(hash, { clientFactory = createPharosClient } = {}) {
  const normalizedHash = typeof hash === "string" ? hash.trim() : "";
  if (!transactionHashIsValid(normalizedHash)) throw new Error("Enter a Pharos transaction hash: 0x followed by 64 hexadecimal characters.");

  const client = await clientFactory();
  try {
    const [transactionResult, receiptResult] = await Promise.all([
      callTool(client, "get_transaction", { hash: normalizedHash }),
      callTool(client, "get_transaction_receipt", { hash: normalizedHash }),
    ]);
    const transaction = unwrap(transactionResult, "transaction");
    const receipt = unwrap(receiptResult, "receipt");
    if (!transaction && !receipt) return { hash: normalizedHash, status: "not-found", explorerUrl: `https://www.pharosscan.xyz/tx/${normalizedHash}`, via: "Pharos Chain MCP" };
    if (transaction && !receipt) return { hash: normalizedHash, status: "pending", transaction, explorerUrl: `https://www.pharosscan.xyz/tx/${normalizedHash}`, via: "Pharos Chain MCP" };

    let replayError = "";
    if (receipt && /^(?:0x0+|0)$/i.test(String(receipt.status ?? ""))) {
      const replay = buildReplayRequest({ ...transaction, blockNumber: transaction?.blockNumber ?? receipt?.blockNumber });
      if (replay) {
        try {
          await callTool(client, "eth_call", replay);
        } catch (error) {
          replayError = errorText(error);
        }
      }
    }
    return analyzeTransaction({ hash: normalizedHash, transaction: transaction || {}, receipt: receipt || {}, replayError });
  } finally {
    await client.close().catch(() => {});
  }
}
