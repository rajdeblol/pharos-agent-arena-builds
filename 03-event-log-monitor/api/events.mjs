import { readEvents } from "../lib/monitor.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Use GET to read event logs." });
  }
  try {
    const url = new URL(request.url, "https://monitor.invalid");
    const result = await readEvents({
      token: url.searchParams.get("token") || undefined,
      lookback: url.searchParams.get("lookback") || 200,
      since: url.searchParams.get("since"),
    });
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The event scan failed.";
    return response.status(502).json({ error: detail });
  }
}
