import { CATALOG, encodePayment, handlePaidEndpoint } from "../lib/paid-api.mjs";

const DEMOS = {
  complete: { label: "Complete the brief", budget: 0.01, task: "Create an RWA market brief using a signal and a research note.", resources: ["/api/paid/rwa-alpha", "/api/paid/market-brief"] },
  budget: { label: "Stop at the budget", budget: 0.004, task: "Try to create the same RWA market brief, but stop when the available budget is used.", resources: ["/api/paid/rwa-alpha", "/api/paid/market-brief"] },
};
const toUsd = (units) => Number(units) / 1_000_000;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST to run an agent demo." }); }
  const scenario = DEMOS[String(req.body?.scenario || "complete")];
  if (!scenario) return res.status(400).json({ error: "Choose one of the listed demo scenarios." });
  const budget = Number(req.body?.budget ?? scenario.budget);
  const perCallCap = Number(req.body?.perCallCap ?? 0.005);
  if (!Number.isFinite(budget) || budget < 0 || budget > 1 || !Number.isFinite(perCallCap) || perCallCap < 0 || perCallCap > 1) return res.status(400).json({ error: "Budget and per-call cap must be between $0 and $1." });

  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const state = { receipts: new Map(), dropped: new Set() };
  const payments = [];
  const trace = [];
  let spent = 0;
  const results = [];
  let stopped = false;

  for (const path of scenario.resources) {
    const item = CATALOG[path];
    const quote = await handlePaidEndpoint(path, new Request(`https://demo.pharos.local${path}`, { method: "GET" }), state);
    trace.push({ status: quote.status, method: "GET", endpoint: path, phase: "price-discovery" });
    if (quote.status !== 402) { results.push({ path, error: `Expected payment-required, received ${quote.status}.` }); stopped = true; break; }
    const requirement = await quote.json();
    const accepted = requirement.accepts?.find((entry) => entry.scheme === "exact" && entry.network === "eip155:688689");
    if (!accepted) { results.push({ path, error: "Endpoint did not offer the supported Pharos testnet payment scheme." }); stopped = true; break; }
    const price = toUsd(accepted.amount);
    if (price > perCallCap) {
      const reason = `Price $${price.toFixed(3)} is above the $${perCallCap.toFixed(3)} per-call cap.`;
      payments.push({ endpoint: path, what: item.name, priceUsd: price, transaction: null, runningTotalUsd: spent, decision: "REFUSED", reason, simulated: true });
      results.push({ path, name: item.name, error: reason }); stopped = true; break;
    }
    if (spent + price > budget) {
      const reason = `Buying ${item.name} for $${price.toFixed(3)} would exceed the $${budget.toFixed(3)} total budget (already spent $${spent.toFixed(3)}).`;
      payments.push({ endpoint: path, what: item.name, priceUsd: price, transaction: null, runningTotalUsd: spent, decision: "REFUSED", reason, simulated: true });
      results.push({ path, name: item.name, error: reason }); stopped = true; break;
    }

    const idempotencyKey = `${runId}-${path.split("/").at(-1)}`;
    const payment = encodePayment({ x402Version: 2, resource: requirement.resource, accepted, payload: { signature: "SIMULATED_ONLY", authorization: null }, demoOnly: true, idempotencyKey, retryDemo: path === "/api/paid/market-brief" });
    let paidResponse;
    let attempt = 0;
    do {
      attempt += 1;
      paidResponse = await handlePaidEndpoint(path, new Request(`https://demo.pharos.local${path}`, { method: "GET", headers: { "payment-signature": payment, "idempotency-key": idempotencyKey } }), state);
      trace.push({ status: paidResponse.status, method: "GET + X-PAYMENT", endpoint: path, phase: "paid-fetch", attempt, idempotencyKey });
    } while (paidResponse.status === 503 && attempt < 2);

    if (!paidResponse.ok) {
      results.push({ path, name: item.name, error: `Paid request failed with HTTP ${paidResponse.status}; stopped safely.` }); stopped = true; break;
    }
    const data = await paidResponse.json();
    const receipt = data.paymentReceipt;
    if (!receipt?.success || !receipt?.transaction) { results.push({ path, name: item.name, error: "Endpoint returned no verifiable demo receipt." }); stopped = true; break; }
    if (!payments.some((entry) => entry.transaction === receipt.transaction)) {
      spent += price;
      payments.push({ endpoint: path, what: item.name, priceUsd: price, transaction: receipt.transaction, runningTotalUsd: spent, decision: "PAID (SIMULATED)", simulated: true, attempts: attempt });
    }
    results.push({ path, name: item.name, data, receipt });
  }

  const completed = !stopped && results.length === scenario.resources.length;
  const deliverable = completed ? {
    task: scenario.task,
    brief: `RWA note: ${results[0]?.data?.signal}. Context: ${results[1]?.data?.summary}`,
    risks: results[1]?.data?.risks || [],
    nextStep: results[1]?.data?.nextStep || "Review the source data before acting.",
    sources: results.map((entry) => entry.path),
  } : null;
  return res.status(200).json({ runId, scenario: scenario.label, task: scenario.task, mode: "SIMULATION", network: "Pharos Atlantic Testnet (x402 format preview)", totalBudgetUsd: budget, perCallCapUsd: perCallCap, spentUsd: spent, remainingUsd: Math.max(0, budget - spent), outcome: completed ? "TASK_COMPLETE" : "STOPPED_AT_BUDGET_OR_GUARD", deliverable, summary: stopped ? "The agent stopped before a payment would break its budget or price cap." : "The agent fetched both paid resources and assembled the requested brief.", payments, trace, results, note: "Demo-only x402 v2-shaped exchange using PAYMENT-REQUIRED, PAYMENT-SIGNATURE, and PAYMENT-RESPONSE headers. Signatures and receipt IDs are simulated, not valid payment proofs or on-chain transaction hashes; no wallet, facilitator, or blockchain settlement is used." });
}
