import { scanAddress } from "../09-wallet-risk-checker/src/pharos-mcp.mjs";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST to check an address." });
  }

  const body = request.body ?? {};
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const lookback = Number(body.lookback ?? 1000);
  try {
    const report = await scanAddress(address, { lookback });
    return response.status(200).json(report);
  } catch (error) {
    const message = String(error?.message || "");
    if (/valid Pharos address|lookback/i.test(message)) {
      return response.status(400).json({ error: message });
    }
    if (/not found|unknown address/i.test(message)) {
      return response.status(404).json({ error: "Pharos Chain MCP could not find this address." });
    }
    if (/timed? ?out|timeout|429|rate.?limit|fetch failed|network|socket/i.test(message)) {
      return response.status(502).json({ error: "Pharos Chain MCP is temporarily unavailable. Try again shortly." });
    }
    return response.status(502).json({ error: "Could not complete the address checks through Pharos Chain MCP." });
  }
}
