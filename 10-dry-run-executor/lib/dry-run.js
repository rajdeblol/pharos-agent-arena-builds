import { encodeFunctionData, erc20Abi, getAddress, isAddress, parseUnits } from "viem";
import { callJson } from "./mcp.js";
import { PACIFIC } from "./tokens.js";
import { plainReason, reasonFromMessage } from "./revert.js";
import { explorerAddress, formatAmount, formatInteger, labeled } from "./format.js";

/** Pacific Mainnet, from the network page. Transactions there are legacy (type 0) and priced in wei. */
export const PACIFIC_CHAIN_ID = 1672;

/** Public Pacific addresses used only as simulation samples. Nothing is signed or sent. */
export const SAMPLE_FROM = "0x15dDce897D76ac39c188AdE4D353711A60395315";
export const SAMPLE_POOL = "0x912c9aDe24D44d8922f0866D8Dcb079f1363f647";
export const SAMPLE_TO = "0x000000000000000000000000000000000000dEaD";

export const SAMPLES = {
  pass: { kind: "transfer", token: "USDC", from: SAMPLE_FROM, to: SAMPLE_TO, amount: "1" },
  revert: { kind: "transfer", token: "USDC", from: SAMPLE_FROM, to: SAMPLE_TO, amount: "999999999999" },
  gas: { kind: "transfer", token: "USDC", from: SAMPLE_POOL, to: SAMPLE_TO, amount: "1" },
};

function fail(lang, en, pt) {
  const error = new Error(lang === "pt" ? pt : en);
  error.status = 400;
  throw error;
}

function say(lang, pack) {
  return lang === "pt" ? pack.pt : pack.en;
}

function asAddress(value, lang, labelEn, labelPt) {
  const text = String(value ?? "").trim();
  if (!isAddress(text)) fail(lang, `${labelEn} is not an address.`, `${labelPt} não é um endereço.`);
  return getAddress(text);
}

export function parseAmount(amount, decimals, lang = "en") {
  const text = String(amount ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) fail(lang, "Amount has to be a plain number.", "O valor tem que ser um número.");
  try {
    const raw = parseUnits(text, decimals);
    if (raw <= 0n) fail(lang, "Amount has to be greater than zero.", "O valor tem que ser maior que zero.");
    return raw;
  } catch {
    fail(lang, "That amount does not fit this token.", "Esse valor não cabe nesse token.");
  }
}

export function resolveIntent(input = {}) {
  const lang = input.lang === "pt" ? "pt" : "en";
  const sample = SAMPLES[String(input.sample || "").toLowerCase()];
  const src = sample ? { ...sample, ...stripEmpty(input), lang } : { ...input, lang };
  if (sample) {
    src.kind = sample.kind;
    src.token = sample.token;
    src.from = sample.from;
    src.to = sample.to;
    src.amount = sample.amount;
  }
  return buildCall({ ...src, lang });
}

function stripEmpty(input) {
  const out = {};
  for (const key of ["kind", "token", "from", "to", "amount"]) {
    if (input[key] != null && String(input[key]).trim() !== "") out[key] = input[key];
  }
  return out;
}

export function buildCall(intent) {
  const lang = intent.lang === "pt" ? "pt" : "en";
  const kind = ["transfer", "approve", "native"].includes(intent.kind) ? intent.kind : "transfer";
  const from = asAddress(intent.from, lang, "From", "De");
  if (kind === "native") {
    const recipient = asAddress(intent.to, lang, "To", "Para");
    const amount = parseAmount(intent.amount, 18, lang);
    return { lang, kind, from, to: recipient, data: "0x", value: amount, token: null, symbol: "PROS", decimals: 18, amount, recipient };
  }
  const symbol = String(intent.token || "USDC").toUpperCase();
  const token = PACIFIC[symbol];
  if (!token) fail(lang, "Token has to be USDC, WPROS, LINK or WETH.", "O token tem que ser USDC, WPROS, LINK ou WETH.");
  const recipient = asAddress(intent.to, lang, kind === "approve" ? "Spender" : "To", kind === "approve" ? "Quem pode gastar" : "Para");
  const amount = parseAmount(intent.amount, token.decimals, lang);
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: kind === "approve" ? "approve" : "transfer",
    args: [recipient, amount],
  });
  return { lang, kind, from, to: token.address, data, value: 0n, token, symbol: token.symbol, decimals: token.decimals, amount, recipient };
}

/** Funds move only when the call succeeded and the sender can pay the fee. */
export function balanceDelta(before, after) {
  if (before === after) return { same: true, sign: 0, abs: 0n };
  const diff = after - before;
  return { same: false, sign: diff > 0n ? 1 : -1, abs: diff < 0n ? -diff : diff };
}

export function predictBalances({ callOk, canPay, kind, amount, fromToken, toToken, allowance, fromNative, toNative = 0n, value, fee }) {
  const mined = Boolean(callOk && canPay && fee != null);
  const movesToken = mined && kind === "transfer";
  const movesAllowance = mined && kind === "approve";
  const nativeDebit = mined ? (value ?? 0n) + fee : 0n;
  return {
    mined,
    fromToken: movesToken ? fromToken - amount : fromToken,
    toToken: movesToken ? toToken + amount : toToken,
    allowance: movesAllowance ? amount : allowance,
    fromNative: fromNative - nativeDebit,
    toNative: (toNative ?? 0n) + (mined && kind === "native" ? (value ?? 0n) : 0n),
  };
}

/** The gas model asks for a limit 20% above estimateGas, so a refund cannot make the tx run out. */
export function bufferedGas(gas) {
  if (gas == null) return null;
  return BigInt(gas) * 12n / 10n;
}

export function decide({ callOk, gas, gasPriceWei, nativeWei, valueWei }) {
  const price = BigInt(gasPriceWei);
  const estimate = gas == null ? null : BigInt(gas);
  const limit = bufferedGas(estimate);
  const fee = estimate == null ? null : estimate * price;
  const reserve = limit == null ? null : limit * price;
  const needed = (valueWei ?? 0n) + (reserve ?? 0n);
  const canPay = reserve != null && nativeWei >= needed;
  const base = { fee, limit, reserve, needed };
  if (!callOk) return { blocked: true, verdict: "revert", canPay: false, ...base };
  if (!canPay) return { blocked: true, verdict: "gas", canPay: false, ...base };
  return { blocked: false, verdict: "pass", canPay: true, ...base };
}

export function finish(decision, unsigned) {
  return { ...decision, broadcast: false, unsigned: decision.blocked ? null : unsigned };
}

function hexWei(value) {
  return `0x${(value ?? 0n).toString(16)}`;
}

function weiOf(res) {
  if (res?.balanceWei != null && res.balanceWei !== "") return BigInt(res.balanceWei);
  if (res?.balanceHex) return BigInt(res.balanceHex);
  if (res?.result != null && res.result !== "") return BigInt(res.result);
  return 0n;
}

async function tokenBalance(client, token, holder, block) {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [holder] });
  const { result } = await callJson(client, "eth_call", { transaction: { to: token, data }, block });
  return BigInt(result);
}

async function allowanceOf(client, token, owner, spender, block) {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
  const { result } = await callJson(client, "eth_call", { transaction: { to: token, data }, block });
  return BigInt(result);
}

function row(label, beforeRaw, afterRaw, decimals, lang, locale) {
  const show = (raw) => formatAmount(raw, decimals, decimals >= 18 ? 8 : 6, locale);
  const before = show(beforeRaw);
  const after = show(afterRaw);
  const change = balanceDelta(beforeRaw, afterRaw);
  const delta = change.same
    ? say(lang, { pt: "igual", en: "unchanged" })
    : `${change.sign > 0 ? "+" : "−"}${show(change.abs)}`;
  return { label, before, after, delta, same: change.same, line: `${label}: ${before} → ${change.same ? delta : after}` };
}

export async function simulate(client, input = {}) {
  const call = resolveIntent(input);
  const lang = call.lang;
  const locale = lang === "pt" ? "pt" : "en";
  const who = locale;
  const chain = await callJson(client, "get_chain_info");
  const gasPrice = await callJson(client, "get_gas_price");
  const block = Number(chain.latestBlock);
  const gasPriceWei = BigInt(gasPrice.gasPriceWei ?? gasPrice.gasPriceHex ?? 0);

  const tx = { from: call.from, to: call.to, data: call.data, value: hexWei(call.value) };
  const [fromNativeRes, nonceRes, fromToken, toToken, allowance, toNativeRes] = await Promise.all([
    callJson(client, "get_balance", { address: call.from, block }),
    callJson(client, "get_transaction_count", { address: call.from, block }),
    call.token ? tokenBalance(client, call.to, call.from, block) : Promise.resolve(0n),
    call.token && call.kind === "transfer" ? tokenBalance(client, call.to, call.recipient, block) : Promise.resolve(0n),
    call.token && call.kind === "approve" ? allowanceOf(client, call.to, call.from, call.recipient, block) : Promise.resolve(0n),
    call.kind === "native" ? callJson(client, "get_balance", { address: call.recipient, block }) : Promise.resolve(null),
  ]);
  const fromNative = weiOf(fromNativeRes);
  const toNative = toNativeRes ? weiOf(toNativeRes) : 0n;
  const nonce = Number(nonceRes.transactionCount ?? nonceRes.count ?? nonceRes.nonce ?? nonceRes.result ?? 0);
  if (Number(chain.chainId) !== PACIFIC_CHAIN_ID) {
    const headline = say(lang, { pt: "Simulação bloqueada.", en: "Simulation blocked." });
    const reason = say(lang, {
      pt: `A rede respondeu chain ${chain.chainId}. Pacific é ${PACIFIC_CHAIN_ID}.`,
      en: `The node answered chain ${chain.chainId}. Pacific is ${PACIFIC_CHAIN_ID}.`,
    });
    const gate = say(lang, {
      pt: "Envio bloqueado. Não é a Pacific.",
      en: "Execution blocked. This is not Pacific.",
    });
    return { ok: true, blocked: true, broadcast: false, verdict: "revert", headline, reason, gate, lines: [reason, gate], rows: [], action: "", block, gas: null, gasPriceGwei: gasPrice.gasPriceGwei, fee: null, from: call.from, to: call.recipient, contract: call.token ? call.to : null, fromLink: explorerAddress(call.from), unsigned: null, attempted: Boolean(input.execute) };
  }

  let callOk = false;
  let decoded = null;
  try {
    await callJson(client, "eth_call", { transaction: tx, block });
    callOk = true;
  } catch (error) {
    decoded = reasonFromMessage(error.message);
  }

  let gas = null;
  if (callOk) {
    try {
      const est = await callJson(client, "estimate_gas", { transaction: tx });
      gas = BigInt(est.gas ?? est.gasUsed ?? est.gasHex);
    } catch (error) {
      callOk = false;
      decoded = decoded || reasonFromMessage(error.message);
    }
  }

  const decision = decide({ callOk, gas, gasPriceWei, nativeWei: fromNative, valueWei: call.value });
  const predicted = predictBalances({
    callOk,
    canPay: decision.canPay,
    kind: call.kind,
    amount: call.amount,
    fromToken,
    toToken,
    allowance,
    fromNative,
    toNative,
    value: call.value,
    fee: decision.fee,
  });

  const money = (raw, decimals) => formatAmount(raw, decimals, decimals >= 18 ? 8 : 6, locale);
  const rows = [];
  if (call.kind === "transfer") {
    rows.push(row(say(lang, { pt: `${call.symbol} de quem envia`, en: `Sender ${call.symbol}` }), fromToken, predicted.fromToken, call.decimals, lang, locale));
    rows.push(row(say(lang, { pt: `${call.symbol} de quem recebe`, en: `Recipient ${call.symbol}` }), toToken, predicted.toToken, call.decimals, lang, locale));
  } else if (call.kind === "approve") {
    rows.push(row(say(lang, { pt: `Permissão de ${call.symbol}`, en: `${call.symbol} allowance` }), allowance, predicted.allowance, call.decimals, lang, locale));
  } else if (call.kind === "native") {
    rows.push(row(say(lang, { pt: "PROS de quem recebe", en: "Recipient PROS" }), toNative, predicted.toNative, 18, lang, locale));
  }
  rows.push(row(say(lang, { pt: "PROS de quem envia", en: "Sender PROS" }), fromNative, predicted.fromNative, 18, lang, locale));

  const reason = !callOk
    ? (plainReason(decoded, lang) || say(lang, { pt: "A chamada reverteu e o nó não devolveu o motivo.", en: "The call reverted and the node did not return a reason." }))
    : decision.verdict === "gas"
      ? say(lang, {
        pt: `A chamada no contrato passaria. A taxa prevista é ${money(decision.fee ?? 0n, 18)} PROS e o limite reserva ${money(decision.reserve ?? 0n, 18)} PROS. Essa carteira tem ${money(fromNative, 18)} PROS.`,
        en: `The contract call would succeed. The expected fee is ${money(decision.fee ?? 0n, 18)} PROS and the limit reserves ${money(decision.reserve ?? 0n, 18)} PROS. This wallet has ${money(fromNative, 18)} PROS.`,
      })
      : say(lang, { pt: "A chamada passou e a carteira cobre a taxa.", en: "The call succeeded and the wallet covers the fee." });

  const headline = decision.verdict === "pass"
    ? say(lang, { pt: "Simulação passou.", en: "Simulation passed." })
    : decision.verdict === "gas"
      ? say(lang, { pt: "Sem PROS para o gás.", en: "Cannot pay the gas." })
      : say(lang, { pt: "Simulação reverteu.", en: "Simulation reverted." });

  const attempted = Boolean(input.execute);
  const gate = decision.verdict === "gas"
    ? say(lang, {
      pt: "Envio bloqueado. A chamada até passaria, mas sem PROS para a taxa ela não entra.",
      en: "Execution blocked. The call would succeed, but without PROS for the fee it does not get in.",
    })
    : decision.blocked
    ? say(lang, {
      pt: "Envio bloqueado. A simulação reverteu, então nada foi montado para assinar.",
      en: "Execution blocked. The simulation reverted, so nothing was prepared for signing.",
    })
    : attempted
      ? say(lang, {
        pt: "A trava deixou passar. Não foi enviado. Este servidor não tem chave.",
        en: "The gate let this one through. It was not broadcast. This server has no key.",
      })
      : say(lang, {
        pt: "Pode assinar. Nada foi enviado. A transação abaixo está sem assinatura.",
        en: "Clear to sign. Nothing was broadcast. The transaction below is unsigned.",
      });

  const unsigned = {
    chainId: PACIFIC_CHAIN_ID,
    type: "0x0",
    from: call.from,
    to: call.to,
    data: call.data,
    value: hexWei(call.value),
    gas: decision.limit == null ? null : `0x${decision.limit.toString(16)}`,
    gasPrice: hexWei(gasPriceWei),
    nonce,
  };
  const gated = finish(decision, unsigned);
  const amountText = money(call.amount, call.decimals);
  const action = call.kind === "native"
    ? say(lang, { pt: `enviar ${amountText} PROS`, en: `send ${amountText} PROS` })
    : call.kind === "approve"
      ? say(lang, { pt: `aprovar ${amountText} ${call.symbol}`, en: `approve ${amountText} ${call.symbol}` })
      : say(lang, { pt: `transferir ${amountText} ${call.symbol}`, en: `transfer ${amountText} ${call.symbol}` });

  const gasLine = gas == null
    ? say(lang, { pt: "Gás: a estimativa também reverteu, então não há taxa.", en: "Gas: the estimate reverted too, so there is no fee." })
    : say(lang, {
      pt: `Gás estimado ${formatInteger(gas, locale)}. Taxa ${money(decision.fee ?? 0n, 18)} PROS a ${gasPrice.gasPriceGwei} gwei. Limite ${formatInteger(decision.limit, locale)}.`,
      en: `Estimated gas ${formatInteger(gas, locale)}. Fee ${money(decision.fee ?? 0n, 18)} PROS at ${gasPrice.gasPriceGwei} gwei. Limit ${formatInteger(decision.limit, locale)}.`,
    });

  const lines = [
    `${say(lang, { pt: "Ação", en: "Action" })}: ${action}`,
    `${say(lang, { pt: "De", en: "From" })}: ${labeled(call.from, {}, who)}`,
    `${say(lang, { pt: "Para", en: "To" })}: ${labeled(call.kind === "native" ? call.to : call.recipient, {}, who)}`,
    call.token ? `${say(lang, { pt: "Contrato", en: "Contract" })}: ${labeled(call.to, {}, who)}` : "",
    gasLine,
    `${say(lang, { pt: "Bloco", en: "Block" })}: ${formatInteger(block, locale)}`,
    reason,
    ...rows.map((item) => item.line),
    gate,
  ].filter(Boolean);

  return {
    ok: true,
    blocked: gated.blocked,
    broadcast: false,
    verdict: decision.verdict,
    headline,
    reason,
    gate,
    gasLine,
    lines,
    rows,
    action,
    block,
    gas: gas == null ? null : gas.toString(),
    gasPriceGwei: gasPrice.gasPriceGwei,
    fee: decision.fee == null ? null : decision.fee.toString(),
    from: call.from,
    to: call.kind === "native" ? call.to : call.recipient,
    contract: call.token ? call.to : null,
    fromLink: explorerAddress(call.from),
    unsigned: gated.unsigned,
    attempted,
  };
}
