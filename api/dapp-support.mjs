import { investigateTransaction } from "../08-dapp-support-agent/src/pharos-mcp.mjs";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST to inspect a transaction." });
  }

  const hash = typeof request.body?.hash === "string" ? request.body.hash.trim() : "";
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return response.status(400).json({ error: "Enter a transaction hash with 0x followed by 64 hexadecimal characters." });
  }

  try {
    const result = await investigateTransaction(hash);
    return response.status(200).json(result);
  } catch (error) {
    const detail = String(error?.message || "");
    if (/404|not found|unknown transaction/i.test(detail)) {
      return response.status(404).json({ error: "Pharos Chain MCP could not find that transaction. Check the hash and confirm it is on Pharos mainnet." });
    }
    if (/timed? ?out|timeout|429|rate.?limit|fetch failed|network|socket/i.test(detail)) {
      return response.status(502).json({ error: "Pharos Chain MCP is temporarily unavailable. Try again in a moment." });
    }
    return response.status(502).json({ error: "Could not read this transaction from Pharos Chain MCP." });
  }
}
