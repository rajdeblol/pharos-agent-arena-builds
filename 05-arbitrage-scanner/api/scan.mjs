import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.PHAROS_MCP_URL || "https://mcp.pharos.xyz/mcp";
const ADDR = /^0x[\da-fA-F]{40}$/;
const DEFAULTS = {
  base: "0x52C48d4213107b20bC583832b0d951FB9CA8F0B0",
  quote: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815",
  dodo: "0xac998dD78829aDe9f654e0BE7a4D7F60D8B37196",
  faro: "0x7F4A462FC320db1E26dd1366DcE9E276eE6c5930",
  gasUnits: 260000,
  gasUsd: 0.1,
  threshold: 0.05,
  slippageBps: 30,
};

const selectors = {
  baseToken: "0x4a248d2a", quoteToken: "0xd4b97046", baseReserve: "0x7d721504",
  quoteReserve: "0xbbf5ce78", sellBase: "0x79a04876", sellQuote: "0x66410a21",
  token0: "0x0dfe1681", token1: "0xd21220a7", reserves: "0x0902f1ac", feeRate: "0x978bbdb9",
};

function word(value) { return BigInt(value).toString(16).padStart(64, "0"); }
function addrWord(value) { return value.slice(2).toLowerCase().padStart(64, "0"); }
function readWord(hex, i = 0) { return BigInt(`0x${hex.replace(/^0x/, "").slice(i * 64, (i + 1) * 64) || "0"}`); }
function decodeAddress(hex) { return `0x${hex.replace(/^0x/, "").slice(-40)}`; }
function fmt(raw, decimals) { return Number(raw) / (10 ** decimals); }
function validAddr(v, name) { if (typeof v !== "string" || !ADDR.test(v)) throw new Error(`${name} must be a valid EVM address.`); return v; }

async function mcp(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (result.isError || !text) throw new Error(text || `${name} failed on Chain MCP.`);
  try { return JSON.parse(text); } catch { throw new Error(`${name} returned an unreadable response.`); }
}
async function call(client, to, data, block) {
  const result = await mcp(client, "eth_call", { transaction: { to, data }, block: block });
  const hex = result.result || result.data || result;
  if (typeof hex !== "string" || !/^0x[\da-fA-F]+$/.test(hex)) throw new Error(`Could not decode eth_call for ${to}.`);
  return hex;
}
async function tokenMeta(client, address, block) {
  const [decHex, symHex] = await Promise.all([
    call(client, address, "0x313ce567", block), call(client, address, "0x95d89b41", block),
  ]);
  const decimals = Number(readWord(decHex));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`Invalid token decimals at ${address}.`);
  const raw = symHex.replace(/^0x/, "");
  let symbol = "TOKEN";
  try {
    let offset = Number(readWord(symHex));
    if (offset * 2 + 64 <= raw.length) { const length = Number(BigInt(`0x${raw.slice(offset * 2, offset * 2 + 64)}`)); symbol = Buffer.from(raw.slice(offset * 2 + 64, offset * 2 + 64 + length * 2), "hex").toString("utf8") || symbol; }
    else symbol = Buffer.from(raw.slice(0, 64), "hex").toString("utf8").replace(/\0/g, "") || symbol;
  } catch {}
  return { address, decimals, symbol };
}
function cpOut(amountIn, reserveIn, reserveOut, feeBps) {
  const netIn = amountIn * BigInt(10000 - feeBps);
  return (netIn * reserveOut) / (reserveIn * 10000n + netIn);
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST to run a scan." }); }
  const cfg = { ...DEFAULTS, ...(req.body || {}) };
  try {
    cfg.base = validAddr(cfg.base, "Base token"); cfg.quote = validAddr(cfg.quote, "Quote token");
    cfg.dodo = validAddr(cfg.dodo, "DODO pool"); cfg.faro = validAddr(cfg.faro, "FaroSwap pool");
    const amount = Number(cfg.amount || 100);
    const threshold = Math.max(0, Number(cfg.threshold));
    const prosUsd = Number(cfg.gasUsd);
    const slippageBps = Math.max(0, Math.min(5000, Number(cfg.slippageBps)));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new Error("Enter a base-token size above zero (max 1,000,000). ");
    if (!Number.isFinite(threshold) || !Number.isFinite(prosUsd) || prosUsd < 0 || !Number.isFinite(slippageBps)) throw new Error("Threshold, gas conversion and slippage inputs must be valid non-negative numbers.");

    const client = new Client({ name: "pharos-arbitrage-scanner", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));
      const [chain, head] = await Promise.all([mcp(client, "get_chain_info"), mcp(client, "get_block_number")]);
      const block = Number(head.blockNumber);
      if (!Number.isSafeInteger(block)) throw new Error("Chain MCP returned an invalid block number.");
      const [base, quote] = await Promise.all([tokenMeta(client, cfg.base, block), tokenMeta(client, cfg.quote, block)]);
      const [dodoBase, dodoQuote, dodoBaseRes, dodoQuoteRes, faro0Hex, faro1Hex, faroResHex, feeHex] = await Promise.all([
        call(client, cfg.dodo, selectors.baseToken, block), call(client, cfg.dodo, selectors.quoteToken, block),
        call(client, cfg.dodo, selectors.baseReserve, block), call(client, cfg.dodo, selectors.quoteReserve, block),
        call(client, cfg.faro, selectors.token0, block), call(client, cfg.faro, selectors.token1, block),
        call(client, cfg.faro, selectors.reserves, block), call(client, cfg.faro, selectors.feeRate, block),
      ]);
      if (decodeAddress(dodoBase).toLowerCase() !== base.address.toLowerCase() || decodeAddress(dodoQuote).toLowerCase() !== quote.address.toLowerCase()) throw new Error("DODO pool token order does not match the selected base/quote pair.");
      const faro0 = decodeAddress(faro0Hex), faro1 = decodeAddress(faro1Hex);
      if (!([faro0.toLowerCase(), faro1.toLowerCase()].includes(base.address.toLowerCase()) && [faro0.toLowerCase(), faro1.toLowerCase()].includes(quote.address.toLowerCase()))) throw new Error("FaroSwap pool does not contain the selected token pair.");
      const bReserve = readWord(dodoBaseRes), qReserve = readWord(dodoQuoteRes);
      const r0 = readWord(faroResHex), r1 = readWord(faroResHex, 1);
      const faroBaseReserve = faro0.toLowerCase() === base.address.toLowerCase() ? r0 : r1;
      const faroQuoteReserve = faro0.toLowerCase() === base.address.toLowerCase() ? r1 : r0;
      const faroFeeRaw = Number(readWord(feeHex));
      // FaroSwap exposes feeRate as basis points on this pair; clamp invalid values and fail closed.
      const faroFeeBps = faroFeeRaw <= 1000 ? faroFeeRaw : Math.round(faroFeeRaw / 1e14);
      if (faroFeeBps < 0 || faroFeeBps > 1000) throw new Error("FaroSwap returned an unsupported fee rate.");

      const amountIn = BigInt(Math.round(amount * (10 ** base.decimals)));
      const quoteAmount = (raw) => `${selectors.sellQuote}${addrWord("0x0000000000000000000000000000000000000001")}${word(raw)}`;
      const baseAmount = (raw) => `${selectors.sellBase}${addrWord("0x0000000000000000000000000000000000000001")}${word(raw)}`;
      const dodoQuoteOut = readWord(await call(client, cfg.dodo, baseAmount(amountIn), block));
      const faroQuoteOut = cpOut(amountIn, faroBaseReserve, faroQuoteReserve, faroFeeBps);
      const routeABack = cpOut(dodoQuoteOut, faroQuoteReserve, faroBaseReserve, faroFeeBps);
      const routeBBack = readWord(await call(client, cfg.dodo, quoteAmount(faroQuoteOut), block));
      const opportunities = [
        { direction: `${base.symbol} → DODO → FaroSwap → ${base.symbol}`, output: routeABack },
        { direction: `${base.symbol} → FaroSwap → DODO → ${base.symbol}`, output: routeBBack },
      ];
      const midDodo = Number(qReserve) / (10 ** quote.decimals) / (Number(bReserve) / (10 ** base.decimals));
      const midFaro = Number(faroQuoteReserve) / (10 ** quote.decimals) / (Number(faroBaseReserve) / (10 ** base.decimals));
      const grossSpreadBps = midDodo > 0 && midFaro > 0 ? Math.abs(midDodo - midFaro) / Math.min(midDodo, midFaro) * 10000 : 0;
      const gasData = await mcp(client, "get_gas_price");
      const gasPriceGwei = Number(gasData.gasPriceGwei);
      const gasUsd = Number(cfg.gasUnits || DEFAULTS.gasUnits) * gasPriceGwei * 1e9 / 1e18 * prosUsd;
      const best = opportunities.reduce((a, b) => a.output > b.output ? a : b);
      const routedBase = fmt(best.output, base.decimals);
      const routeProfitUsd = (routedBase - amount) * midDodo;
      const grossUsd = (grossSpreadBps / 10000) * amount * Math.min(midDodo, midFaro);
      const slippageUsd = amount * Math.min(midDodo, midFaro) * slippageBps / 10000;
      // The live route quotes already include protocol fees and pool price impact. This buffer is an additional user-configured slippage allowance.
      const poolCostsUsd = grossUsd - routeProfitUsd;
      const netUsd = grossUsd - poolCostsUsd - gasUsd - slippageUsd;
      const decision = netUsd > threshold ? "SIMULATED_PREPARE" : "SKIP";
      return res.status(200).json({
        network: chain.name || "Pharos Mainnet", chainId: Number(chain.chainId), block, checkedAt: new Date().toISOString(),
        pair: `${base.symbol}/${quote.symbol}`, amount: `${amount} ${base.symbol}`, sources: ["DODO V2", "FaroSwap V2"],
        prices: { dodo: midDodo, faro: midFaro, faroFeeBps, grossSpreadBps },
        bestRoute: best.direction, grossUsd, routeProfitUsd, poolCostsUsd, costs: { slippageUsd, gasUsd, gasUnits: Number(cfg.gasUnits || DEFAULTS.gasUnits), gasPriceGwei, prosUsd },
        netUsd, thresholdUsd: threshold, decision, reason: decision === "SKIP" ? `Net estimate ($${netUsd.toFixed(4)}) is at or below the $${threshold.toFixed(2)} threshold.` : `Net estimate is above the $${threshold.toFixed(2)} threshold. A simulated plan is ready; no transaction was sent.`,
        execution: decision === "SIMULATED_PREPARE" ? { type: "SIMULATED_ONLY", route: best.direction, amount: `${amount} ${base.symbol}`, estimatedNetUsd: Number(netUsd.toFixed(6)) } : null,
        note: "Both venues are read at the pinned block. DODO uses on-chain querySell quotes; FaroSwap uses live reserves and its exposed fee rate. Route outputs include pool fees and price impact. Gross spread uses reserve-ratio mid-prices; slippage buffer and gas price is read live from Chain MCP; native-token USD conversion and slippage buffer are estimates.",
      });
    } finally { await client.close().catch(() => {}); }
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Scan failed.", decision: "SKIP", reason: "A live source check failed, so no simulated plan was prepared." });
  }
}
