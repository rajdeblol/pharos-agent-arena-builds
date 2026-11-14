import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createPublicClient, decodeEventLog, defineChain, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const SELLER = "https://pharos-x402-paywalled-api.shoupeorg.workers.dev";
const NETWORK = "eip155:688689";
const CHAIN_ID = 688689;
const TOKEN = "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B";
const EXPLORER = "https://atlantic.pharosscan.xyz";
const ENDPOINTS = [
  { path: "/paid/network-snapshot", label: "Paid Network Snapshot", amount: 1000n },
  { path: "/paid/activity-summary", label: "Paid Activity Summary", amount: 2000n },
];
const PROFILES = {
  complete: { label: "Complete the brief", budget: 5000n, cap: 2000n },
  budget: { label: "Stop at the budget", budget: 1000n, cap: 2000n },
};
const tokenAbi = [{ type: "event", name: "Transfer", inputs: [{ indexed: true, name: "from", type: "address" }, { indexed: true, name: "to", type: "address" }, { indexed: false, name: "value", type: "uint256" }] }];
const chain = defineChain({ id: CHAIN_ID, name: "Pharos Atlantic Testnet", nativeCurrency: { name: "PHRS", symbol: "PHRS", decimals: 18 }, rpcUrls: { default: { http: ["https://atlantic.dplabs-internal.com"] } }, blockExplorers: { default: { name: "PharosScan", url: EXPLORER } }, testnet: true });
const publicClient = createPublicClient({ chain, transport: http("https://atlantic.dplabs-internal.com", { timeout: 15000, retryCount: 1 }) });
const runsByIp = new Map();
const atomicUsd = (value) => `$${(BigInt(value) / 1_000_000n).toString()}.${(BigInt(value) % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(3, "0")}`;

async function verifyReceipt({ hash, account, merchant, amount }) {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  if (receipt.status !== "success" || getAddress(receipt.to) !== getAddress(TOKEN)) throw new Error("Settlement receipt did not succeed on the configured USDC token.");
  const transfer = receipt.logs.some((log) => {
    if (getAddress(log.address) !== getAddress(TOKEN)) return false;
    try {
      const event = decodeEventLog({ abi: tokenAbi, data: log.data, topics: log.topics });
      return event.eventName === "Transfer" && getAddress(event.args.from) === getAddress(account) && getAddress(event.args.to) === getAddress(merchant) && event.args.value === BigInt(amount);
    } catch { return false; }
  });
  if (!transfer) throw new Error("Settlement receipt lacks the exact expected USDC transfer.");
  return { confirmed: true, blockNumber: receipt.blockNumber.toString(), transactionHash: receipt.transactionHash };
}

async function readSellerConfig() {
  const response = await fetch(`${SELLER}/api/config`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Seller status returned HTTP ${response.status}.`);
  const config = await response.json();
  if (config.paymentOperational !== true || config.chain?.network !== NETWORK || config.paymentAsset?.address?.toLowerCase() !== TOKEN.toLowerCase()) throw new Error(config.blocker || "Seller is not operational on the expected Atlantic testnet token.");
  return config;
}

async function buyOne({ endpoint, config, buyer, totalBudget, cap, spent, trace }) {
  const url = new URL(endpoint.path, SELLER);
  url.searchParams.set("block", config.chain.latestBlock);
  const challengeResponse = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  trace.push({ status: challengeResponse.status, method: "GET", endpoint: endpoint.path, phase: "price-discovery" });
  if (challengeResponse.status !== 402) throw new Error(`${endpoint.label} did not return an HTTP 402 quote.`);
  const header = challengeResponse.headers.get("PAYMENT-REQUIRED");
  if (!header) throw new Error(`${endpoint.label} quote omitted PAYMENT-REQUIRED.`);
  const required = decodePaymentRequiredHeader(header);
  const accepted = required.accepts?.find((option) => option.scheme === "exact");
  if (required.x402Version !== 2 || !accepted || accepted.network !== NETWORK || getAddress(accepted.asset) !== getAddress(TOKEN) || getAddress(accepted.payTo) !== getAddress(config.merchant) || required.resource?.url !== url.toString()) throw new Error(`${endpoint.label} quote did not match the configured seller, network, token, and resource.`);
  const amount = BigInt(accepted.amount);
  const published = config.endpoints?.find((item) => item.path === endpoint.path);
  if (!published || amount !== BigInt(published.priceAtomic) || amount !== endpoint.amount) throw new Error(`${endpoint.label} price did not match the published route price.`);
  if (amount > cap) return { refused: true, amount, reason: `Price ${atomicUsd(amount)} is above the ${atomicUsd(cap)} per-call cap.` };
  if (spent + amount > totalBudget) return { refused: true, amount, reason: `Price ${atomicUsd(amount)} exceeds the remaining ${atomicUsd(totalBudget - spent)} budget.` };

  const account = buyer.address;
  const balance = await publicClient.readContract({ address: TOKEN, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [account] });
  if (balance < amount) throw new Error(`Agent wallet needs ${atomicUsd(amount)} USDC for this quote; current test-USDC balance is too low.`);
  const paymentPayload = await buyer.client.createPaymentPayload(required);
  const paymentHeader = encodePaymentSignatureHeader(paymentPayload);
  let paidResponse;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      paidResponse = await fetch(url, { headers: { accept: "application/json", "PAYMENT-SIGNATURE": paymentHeader }, signal: AbortSignal.timeout(45000) });
      trace.push({ status: paidResponse.status, method: "GET + PAYMENT-SIGNATURE", endpoint: endpoint.path, phase: "paid-fetch", attempt });
      if (paidResponse.status >= 500 && attempt < 3) { await new Promise((resolve) => setTimeout(resolve, attempt * 500)); continue; }
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) { trace.push({ status: "RETRY", method: "same signed request", endpoint: endpoint.path, phase: "safe-retry", attempt: attempt + 1 }); await new Promise((resolve) => setTimeout(resolve, attempt * 500)); }
    }
  }
  if (!paidResponse) throw new Error(lastError?.message || "The payment response was lost after safe retries. The same authorization was reused.");
  const body = await paidResponse.json().catch(() => ({}));
  if (!paidResponse.ok) throw new Error(body.error || `${endpoint.label} returned HTTP ${paidResponse.status}.`);
  const encodedReceipt = paidResponse.headers.get("PAYMENT-RESPONSE");
  if (!encodedReceipt) throw new Error("Paid response omitted PAYMENT-RESPONSE.");
  const settlement = decodePaymentResponseHeader(encodedReceipt);
  if (!settlement.success || settlement.network !== NETWORK || !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction || "")) throw new Error("Seller did not return a valid Atlantic settlement receipt.");
  const confirmation = await verifyReceipt({ hash: settlement.transaction, account, merchant: config.merchant, amount });
  return { endpoint, amount, data: body, transaction: settlement.transaction, settlement, verification: confirmation };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST to run the server-side buyer." }); }
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) return res.status(503).json({ error: "Server agent wallet is not configured yet. Add AGENT_PRIVATE_KEY in Vercel Environment Variables; never paste it into chat or the repository." });
  let buyer;
  try {
    const account = privateKeyToAccount(privateKey);
    const client = new x402Client();
    client.register(NETWORK, new ExactEvmScheme(account));
    buyer = { address: account.address, client };
  } catch { return res.status(503).json({ error: "Server agent wallet configuration is invalid." }); }

  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const now = Date.now();
  const window = runsByIp.get(ip);
  if (window && window.resetAt > now && window.count >= 3) return res.status(429).json({ error: "This browser has reached the short demo run limit. Try again later." });
  if (!window || window.resetAt <= now) runsByIp.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
  else window.count += 1;

  const scenario = String(req.body?.scenario || "complete");
  const profile = PROFILES[scenario];
  if (!profile) return res.status(400).json({ error: "Choose a supported buyer scenario." });
  let requestedBudget;
  let requestedCap;
  try {
    requestedBudget = req.body?.budget == null ? profile.budget : BigInt(req.body.budget);
    requestedCap = req.body?.perCallCap == null ? profile.cap : BigInt(req.body.perCallCap);
  } catch { return res.status(400).json({ error: "Budget and per-call cap must be integer USDC atomic units." }); }
  if (requestedBudget < 0n || requestedBudget > 5000n || requestedCap < 0n || requestedCap > 2000n) return res.status(400).json({ error: "Server-side run limits cannot exceed 0.005 USDC total and 0.002 USDC per call." });

  const runId = `agent-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const trace = [];
  const results = [];
  const payments = [];
  let spent = 0n;
  let stopReason = "";
  try {
    const config = await readSellerConfig();
    for (const endpoint of ENDPOINTS) {
      const result = await buyOne({ endpoint, config, buyer, totalBudget: requestedBudget, cap: requestedCap, spent, trace });
      if (result.refused) {
        stopReason = result.reason;
        payments.push({ what: endpoint.label, priceAtomic: String(result.amount), runningTotalAtomic: String(spent), decision: "REFUSED", reason: result.reason });
        break;
      }
      spent += result.amount;
      results.push(result);
      payments.push({ what: endpoint.label, priceAtomic: String(result.amount), runningTotalAtomic: String(spent), transaction: result.transaction, decision: "CONFIRMED ON CHAIN", confirmed: true });
    }
    const complete = results.length === 2 && !stopReason;
    const snapshot = results.find((result) => result.endpoint.path.endsWith("network-snapshot"))?.data;
    const activity = results.find((result) => result.endpoint.path.endsWith("activity-summary"))?.data;
    const summary = complete ? `Pharos block ${snapshot.blockNumber} reported base fee ${snapshot.baseFeePerGasWei} wei. Blocks ${activity.windowStartBlock}–${activity.snapshotBlock} contained ${activity.totalTransactions} transactions.` : stopReason || "The run stopped before all resources were purchased.";
    const publicResults = results.map((item) => ({ endpoint: { path: item.endpoint.path, label: item.endpoint.label }, amountAtomic: String(item.amount), data: item.data, transaction: item.transaction, settlement: item.settlement, verification: item.verification }));
    return res.status(200).json({ runId, scenario: profile.label, outcome: complete ? "TASK_COMPLETE" : "STOPPED_AT_BUDGET_OR_GUARD", summary, results: publicResults, payments, trace, spentAtomic: String(spent), totalBudgetAtomic: String(requestedBudget), perCallCapAtomic: String(requestedCap), remainingAtomic: String(requestedBudget > spent ? requestedBudget - spent : 0n), agentAddress: buyer.address, network: NETWORK, mode: "LIVE_ATLANTIC_TESTNET", explorer: EXPLORER, note: "Server-side burner wallet: no browser wallet connection. Real Atlantic test-USDC is spent only after a quote passes the run limits." });
  } catch (error) {
    return res.status(502).json({ runId, error: error.message || "Live agent run failed safely.", payments, trace, spentAtomic: String(spent), totalBudgetAtomic: String(requestedBudget), perCallCapAtomic: String(requestedCap), agentAddress: buyer.address, network: NETWORK });
  }
}
