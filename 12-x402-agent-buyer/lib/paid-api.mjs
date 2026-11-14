const NETWORK = "eip155:688689";
const ASSET = "0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8";
export const CATALOG = {
  "/api/paid/rwa-alpha": {
    name: "RWA alpha signal",
    price: 3000,
    description: "A short demo signal for the Pharos RWA market.",
    data: { signal: "RWA lending demand is steady", confidence: 0.72, sampleWindow: "24h", source: "Demo data" },
  },
  "/api/paid/market-brief": {
    name: "Market research brief",
    price: 5000,
    description: "A compact market brief with risks and a next step.",
    data: { summary: "Stablecoin liquidity is concentrated in a small number of pools.", risks: ["Thin liquidity", "Fast-moving quotes"], nextStep: "Check depth before acting", source: "Demo data" },
  },
};

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
const fromB64 = (value) => JSON.parse(Buffer.from(value, "base64").toString("utf8"));

export async function handlePaidEndpoint(path, request, state = { receipts: new Map(), dropped: new Set() }) {
  const item = CATALOG[path];
  if (!item) return Response.json({ error: "Paid resource not found." }, { status: 404 });
  if (request.method !== "GET") return Response.json({ error: "Use GET for this resource." }, { status: 405, headers: { Allow: "GET" } });

  const paymentHeader = request.headers.get("payment-signature");
  if (!paymentHeader) {
    const requirement = {
      x402Version: 2,
      resource: { url: `https://demo.pharos.local${path}`, description: item.description, mimeType: "application/json" },
      accepts: [{ scheme: "exact", network: NETWORK, amount: String(item.price), asset: ASSET, payTo: "0x0000000000000000000000000000000000000402", maxTimeoutSeconds: 60, extra: { name: "USDC (test token)", version: "2" } }],
    };
    return Response.json(requirement, { status: 402, headers: { "payment-required": b64(requirement), "cache-control": "no-store" } });
  }

  const key = request.headers.get("idempotency-key");
  if (!key) return Response.json({ error: "Idempotency-Key is required." }, { status: 400 });
  if (state.receipts.has(key)) {
    const receipt = state.receipts.get(key);
    return Response.json({ ...item.data, paymentReceipt: receipt }, { status: 200, headers: { "payment-response": b64(receipt), "cache-control": "no-store", "x-idempotent-replay": "true" } });
  }

  let payload;
  try { payload = fromB64(paymentHeader); } catch { return Response.json({ error: "Payment payload is not valid base64 JSON." }, { status: 400 }); }
  const accepted = payload.accepted;
  if (payload.x402Version !== 2 || payload.demoOnly !== true || accepted?.amount !== String(item.price) || accepted?.network !== NETWORK || accepted?.asset?.toLowerCase() !== ASSET.toLowerCase() || !payload.resource?.url?.endsWith(path) || payload.idempotencyKey !== key) return Response.json({ error: "Demo payment does not match the quoted resource, price, network or idempotency key." }, { status: 402 });

  const receipt = { success: true, network: NETWORK, amount: String(item.price), asset: ASSET, resource: path, payer: "0x000000000000000000000000000000000000a402", transaction: `SIMULATED-${key.replace(/[^a-zA-Z0-9]/g, "").slice(-20).toUpperCase()}`, simulated: true };
  state.receipts.set(key, receipt);

  // The demo drops the first acknowledgement after settlement to exercise a safe retry.
  if (payload.retryDemo && !state.dropped.has(key)) {
    state.dropped.add(key);
    return Response.json({ error: "Demo: acknowledgement timed out after settlement." }, { status: 503, headers: { "retry-after": "0" } });
  }

  return Response.json({ ...item.data, paymentReceipt: receipt }, { status: 200, headers: { "payment-response": b64(receipt), "cache-control": "no-store" } });
}

export function encodePayment(payload) { return b64(payload); }
