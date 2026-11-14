import { handlePaidEndpoint } from "../../12-x402-agent-buyer/lib/paid-api.mjs";
export default async function handler(req, res) {
  const response = await handlePaidEndpoint("/api/paid/market-brief", new Request(`https://${req.headers.host || "localhost"}${req.url}`, { method: req.method, headers: req.headers }));
  res.status(response.status);
  for (const [name, value] of response.headers) res.setHeader(name, value);
  return res.send(await response.text());
}
