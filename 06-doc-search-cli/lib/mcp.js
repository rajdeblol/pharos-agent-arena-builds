import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const DOCS_MCP_URL = process.env.PHAROS_DOCS_MCP_URL ?? "https://docs.pharos.xyz/~gitbook/mcp";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRIES = 2;

function isRetryable(error) {
  return /fetch failed|network|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|timed? ?out|\b(429|500|502|503|504)\b/i
    .test(`${error?.message ?? ""} ${error?.cause?.message ?? ""} ${error?.cause?.code ?? ""}`);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectDocsMcp(url = DOCS_MCP_URL) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
    throw new Error("Developer Docs MCP URL must use HTTPS (HTTP is allowed only for local development).");
  }

  const client = new Client({ name: "pharos-doc-search-cli", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(endpoint), { timeout: REQUEST_TIMEOUT_MS });
  return client;
}

export async function callWithRetry(operation, label, maxRetries = RETRIES) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error) || attempt >= maxRetries) {
        throw new Error(`${label}: ${error.message}`, { cause: error });
      }
      await delay(400 * (2 ** attempt));
    }
  }
}

export { REQUEST_TIMEOUT_MS };
