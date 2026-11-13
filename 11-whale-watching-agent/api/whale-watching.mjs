import { scanWhales } from "../lib/watcher.mjs";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST to scan the watchlist." });
  }
  try {
    return response.status(200).json(await scanWhales(request.body ?? {}));
  } catch (error) {
    const message = String(error?.message || "");
    if (/at least one|up to 20|not a valid EVM|threshold|history window/i.test(message)) {
      return response.status(400).json({ error: message });
    }
    return response.status(502).json({ error: /429|rate.?limit|timeout|fetch failed|network|socket|temporarily/i.test(message)
      ? "Pharos Chain MCP is busy right now. Try again in a moment."
      : "Could not load recent transfers from Pharos Chain MCP." });
  }
}
