import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.PHAROS_MCP_URL || "https://mcp.pharos.xyz/mcp";
const EXPLORER_URL = "https://www.pharosscan.xyz/address/";

function assertAddress(address) {
  if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("That address doesn't look right. Paste a 0x address with 40 hex characters.");
  }
  return address;
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (result.isError) {
    let detail = text;
    try { detail = JSON.parse(text || "{}").error?.message || detail; } catch {}
    throw new Error(detail || `${name} returned an error.`);
  }
  if (!text) throw new Error(`${name} returned no readable result.`);
  try { return JSON.parse(text); }
  catch { throw new Error(`${name} returned a response the app couldn't read.`); }
}

function decodeAbiString(hex) {
  const data = hex.slice(2);
  if (!/^[a-fA-F0-9]+$/.test(data) || data.length < 64) {
    throw new Error("The contract returned an invalid text value.");
  }
  if (data.length === 64) {
    const bytes = data.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16));
    return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0+$/, "").trim();
  }
  const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
  if (!Number.isSafeInteger(offset) || offset < 64 || offset + 64 > data.length) {
    throw new Error("The contract returned an invalid text offset.");
  }
  const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
  const start = offset + 64;
  const encoded = data.slice(start, start + length * 2);
  if (!Number.isSafeInteger(length) || encoded.length !== length * 2) {
    throw new Error("The contract returned an incomplete text value.");
  }
  const bytes = encoded.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) || [];
  return new TextDecoder().decode(new Uint8Array(bytes)).trim();
}

function formatUnits(raw, decimals) {
  const amount = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const remainder = amount % scale;
  if (decimals === 0) return whole.toLocaleString("en-US");
  const fraction = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export async function readContractState(inputAddress) {
  const address = assertAddress(inputAddress);
  const client = new Client({ name: "contract-field-notes", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  try {
    await client.connect(transport);
    const chain = await callTool(client, "get_chain_info");
    const block = chain.latestBlock;
    const selectors = {
      name: "0x06fdde03",
      symbol: "0x95d89b41",
      decimals: "0x313ce567",
      totalSupply: "0x18160ddd",
    };
    const values = await Promise.all(Object.entries(selectors).map(async ([key, data]) => {
      const response = await callTool(client, "eth_call", {
        transaction: { to: address, data },
        block,
      });
      if (!/^0x[0-9a-fA-F]+$/.test(response.result || "")) {
        throw new Error(`The contract didn't return a valid ${key} value.`);
      }
      return [key, response.result];
    }));
    const raw = Object.fromEntries(values);
    const decimals = Number(BigInt(raw.decimals));
    if (!Number.isSafeInteger(decimals) || decimals > 255) {
      throw new Error("The contract returned an invalid decimals value.");
    }
    const totalSupplyRaw = BigInt(raw.totalSupply).toString();
    return {
      network: chain.name || "Pharos",
      chainId: Number(chain.chainId),
      block: String(block),
      address,
      explorer: `${EXPLORER_URL}${address}`,
      token: {
        name: decodeAbiString(raw.name),
        symbol: decodeAbiString(raw.symbol),
        decimals,
        totalSupply: formatUnits(totalSupplyRaw, decimals),
      },
      raw: {
        name: raw.name,
        symbol: raw.symbol,
        decimals: BigInt(raw.decimals).toString(),
        totalSupply: totalSupplyRaw,
      },
      readAt: new Date().toISOString(),
      via: "Pharos Chain MCP",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Pharos read failed.";
    if (/execution reverted|revert|invalid opcode/i.test(message)) {
      throw new Error("That address didn't answer the standard ERC-20 reads. Check that it is a token contract on Pharos.");
    }
    throw error;
  } finally {
    await client.close().catch(() => {});
  }
}
