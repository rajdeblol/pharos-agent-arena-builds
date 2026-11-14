const SELLER_ORIGIN = "https://pharos-x402-paywalled-api.shoupeorg.workers.dev";
const ALLOWED_ROUTES = new Set(["/paid/network-snapshot", "/paid/activity-summary"]);
const TOKEN = "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export async function configHandler(_req, res) {
  try {
    const response = await fetch(`${SELLER_ORIGIN}/api/config`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    const config = await response.json();
    res.status(response.status).setHeader("Cache-Control", "no-store");
    return res.json({ ...config, sellerOrigin: SELLER_ORIGIN });
  } catch {
    return res.status(502).json({ error: "Pharos x402 seller status could not be reached." });
  }
}

export async function paidProxyHandler(route, req, res) {
  if (!ALLOWED_ROUTES.has(route)) return res.status(404).json({ error: "Unknown paid route." });
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Use GET for this paid resource." }); }
  const block = String(req.query?.block || "");
  if (!/^\d+$/.test(block)) return res.status(400).json({ error: "A pinned numeric block is required." });
  const url = new URL(route, SELLER_ORIGIN);
  url.searchParams.set("block", block);
  try {
    const headers = { accept: "application/json" };
    const signature = req.headers["payment-signature"];
    if (signature) headers["PAYMENT-SIGNATURE"] = signature;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
    res.status(response.status);
    for (const name of ["content-type", "payment-required", "payment-response", "cache-control"]) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader("Cache-Control", "no-store");
    return res.send(await response.text());
  } catch {
    return res.status(502).json({ error: "Paid resource did not respond. If a wallet signature was already sent, retry the same run; the seller safely recovers the same authorization." });
  }
}

const paddedAddress = (address) => `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

export async function receiptHandler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Use GET." }); }
  const hash = String(req.query?.hash || "");
  const payer = String(req.query?.payer || "");
  const amount = String(req.query?.amount || "");
  const merchant = "0x0913E25b83ee4367dEE8f9011E95351e60BF02d7";
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || !/^0x[0-9a-fA-F]{40}$/.test(payer) || !/^\d+$/.test(amount)) return res.status(400).json({ error: "Invalid receipt lookup." });
  try {
    const rpc = await fetch("https://atlantic.dplabs-internal.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }), signal: AbortSignal.timeout(12000) });
    const payload = await rpc.json();
    const receipt = payload.result;
    if (!receipt) return res.status(202).json({ confirmed: false });
    if (receipt.status !== "0x1") return res.status(409).json({ error: "Settlement transaction failed on chain." });
    const expectedFrom = paddedAddress(payer);
    const expectedTo = paddedAddress(merchant);
    const transfer = (receipt.logs || []).find((log) => log.address?.toLowerCase() === TOKEN.toLowerCase() && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics?.[1]?.toLowerCase() === expectedFrom.toLowerCase() && log.topics?.[2]?.toLowerCase() === expectedTo.toLowerCase() && BigInt(log.data || "0x0") === BigInt(amount));
    if (!transfer) return res.status(409).json({ error: "Receipt did not contain the exact expected USDC transfer." });
    return res.status(200).json({ confirmed: true, transactionHash: receipt.transactionHash, blockNumber: BigInt(receipt.blockNumber).toString(), token: TOKEN, payer, merchant, amountAtomic: amount });
  } catch {
    return res.status(502).json({ error: "Atlantic receipt lookup failed." });
  }
}
