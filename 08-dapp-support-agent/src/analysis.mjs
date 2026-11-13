const ERROR_STRING_SELECTOR = "08c379a0";
const PANIC_SELECTOR = "4e487b71";

const PANIC_REASONS = new Map([
  ["0x01", "an assertion failed"],
  ["0x11", "an arithmetic overflow or underflow occurred"],
  ["0x12", "the contract divided by zero"],
  ["0x21", "an invalid enum value was used"],
  ["0x22", "a storage byte array was malformed"],
  ["0x31", "an empty array was read with pop()"],
  ["0x32", "an array or byte string was indexed out of bounds"],
  ["0x41", "memory allocation exceeded the limit"],
  ["0x51", "an uninitialized function was called"],
]);

function asHex(value) {
  return typeof value === "string" && /^0x[0-9a-f]*$/i.test(value) ? value.slice(2).toLowerCase() : "";
}

function decodeUtf8(hex) {
  const bytes = hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes)).replace(/\0+$/g, "").trim();
}

export function decodeRevertData(value) {
  const data = asHex(value);
  if (data.startsWith(ERROR_STRING_SELECTOR) && data.length >= 8 + 128) {
    try {
      const body = data.slice(8);
      const offset = Number(BigInt(`0x${body.slice(0, 64)}`)) * 2;
      const length = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
      const encoded = body.slice(offset + 64, offset + 64 + length * 2);
      if (Number.isSafeInteger(length) && encoded.length === length * 2) return decodeUtf8(encoded);
    } catch {
      return "";
    }
  }
  if (data.startsWith(PANIC_SELECTOR) && data.length >= 72) {
    const code = BigInt(`0x${data.slice(8, 72)}`);
    const codeHex = `0x${code.toString(16).padStart(2, "0")}`;
    return `Panic ${codeHex}: ${PANIC_REASONS.get(codeHex) ?? "the contract hit a Solidity panic"}.`;
  }
  return "";
}

function formatInteger(value) {
  try { return BigInt(value).toLocaleString("en-US"); }
  catch { return "unknown"; }
}

function isGasLimitExhausted(gasUsed, gasLimit) {
  if (gasUsed == null || gasLimit == null) return false;
  try { return BigInt(gasUsed) >= BigInt(gasLimit); }
  catch { return false; }
}

function normalizeStatus(value) {
  if (value === 0 || value === "0" || /^0x0+$/i.test(String(value ?? ""))) return "failed";
  if (value === 1 || value === "1" || /^0x0*1$/i.test(String(value ?? ""))) return "success";
  return "unknown";
}

function failureFromReason(reason, gasLimited) {
  const text = String(reason ?? "").trim();
  const lower = text.toLowerCase();
  if (gasLimited || /out of gas|gas limit|gas required exceeds allowance/.test(lower)) {
    return {
      type: "out-of-gas",
      title: "The transaction ran out of gas",
      explanation: "Execution used the transaction’s full gas limit and stopped before the contract could finish.",
      fix: "Retry with a higher gas limit or use the wallet’s gas estimation, then review the transaction before confirming.",
      confidence: "Likely",
    };
  }
  if (/insufficient allowance|allowance too low|exceeds allowance|not approved|approve the token/.test(lower)) {
    return {
      type: "allowance",
      title: "The token allowance was too low",
      explanation: text || "The contract could not spend the requested token amount because the wallet’s approval was too small.",
      fix: "Approve the spending contract for the required token amount, then retry. Check the spender address first.",
      confidence: text ? "High" : "Likely",
    };
  }
  if (/insufficient funds for gas|insufficient balance for gas|fee cap.*balance/.test(lower)) {
    return {
      type: "gas-balance",
      title: "The wallet could not cover the network fee",
      explanation: text || "The sender did not have enough native PROS to pay the transaction fee.",
      fix: "Add enough PROS to the sending wallet to cover the fee, then retry.",
      confidence: text ? "High" : "Likely",
    };
  }
  if (/insufficient balance|transfer amount exceeds balance|exceeds balance|not enough balance|low balance/.test(lower)) {
    return {
      type: "token-balance",
      title: "The wallet balance was too low",
      explanation: text || "The transaction attempted to use more tokens than the wallet had available.",
      fix: "Check the wallet’s token balance and reduce the amount or add funds before retrying.",
      confidence: text ? "High" : "Likely",
    };
  }
  if (/slippage|minimum output|amountoutmin|deadline expired|transaction expired/.test(lower)) {
    return {
      type: "slippage-or-deadline",
      title: "The swap conditions were no longer valid",
      explanation: text || "The price moved past the swap’s allowed slippage or its deadline passed before execution.",
      fix: "Review the current quote, adjust slippage only if appropriate, and use a fresh deadline.",
      confidence: text ? "High" : "Likely",
    };
  }
  if (/unauthorized|not owner|access denied|only owner|caller is not/.test(lower)) {
    return {
      type: "access-control",
      title: "This wallet was not allowed to perform the action",
      explanation: text || "The contract rejected the caller because the required role or permission was missing.",
      fix: "Check that you are using the intended wallet and that it has the required role or permission.",
      confidence: text ? "High" : "Likely",
    };
  }
  return {
    type: "contract-revert",
    title: "The contract rejected the transaction",
    explanation: text || "The transaction failed during contract execution, but the chain did not provide a readable reason.",
    fix: "Review the transaction inputs and contract requirements. Check token balance, allowance, limits, and whether the contract is paused before retrying.",
    confidence: text ? "High" : "Limited",
  };
}

export function analyzeTransaction({ hash, transaction, receipt, replayError = "" }) {
  const status = normalizeStatus(receipt?.status);
  const gasUsed = receipt?.gasUsed;
  const gasLimit = transaction?.gas;
  let reason = decodeRevertData(replayError) || String(replayError || "").trim();
  const dataMatch = reason.match(/0x(?:08c379a0|4e487b71)[0-9a-f]+/i);
  if (dataMatch) reason = decodeRevertData(dataMatch[0]) || reason;

  const gasLimited = isGasLimitExhausted(gasUsed, gasLimit);
  const diagnosis = status === "success"
    ? {
        type: "success",
        title: "This transaction succeeded",
        explanation: "The receipt confirms the transaction completed successfully on Pharos.",
        fix: "No fix is needed. If the app still looks wrong, check its event or state update separately.",
        confidence: "Confirmed",
      }
    : status === "failed"
      ? failureFromReason(reason, gasLimited)
      : {
          type: "unknown-status",
          title: "The transaction status could not be confirmed",
          explanation: "The receipt did not contain a recognized success or failure status.",
          fix: "Check the transaction again on PharosScan after the network has indexed it.",
          confidence: "Limited",
        };

  return {
    hash,
    status,
    diagnosis,
    transaction: {
      from: transaction?.from ?? null,
      to: transaction?.to ?? null,
      blockNumber: receipt?.blockNumber ?? transaction?.blockNumber ?? null,
      gasLimit: gasLimit ? formatInteger(gasLimit) : null,
      gasUsed: gasUsed ? formatInteger(gasUsed) : null,
      value: transaction?.value ?? "0x0",
    },
    explorerUrl: `https://www.pharosscan.xyz/tx/${hash}`,
    evidence: [
      `Receipt status: ${status === "failed" ? "failed (0)" : status === "success" ? "success (1)" : "unavailable"}`,
      ...(gasUsed ? [`Gas used: ${formatInteger(gasUsed)}${gasLimit ? ` of ${formatInteger(gasLimit)}` : ""}`] : []),
      ...(reason ? [`Replayed revert reason: ${reason}`] : []),
    ],
    via: "Pharos Chain MCP",
    readOnly: true,
  };
}

export function transactionHashIsValid(hash) {
  return typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash.trim());
}

export function buildReplayRequest(transaction) {
  if (!transaction?.from || !transaction?.to) return null;
  const blockNumber = Number(BigInt(transaction.blockNumber ?? "0x0"));
  if (!Number.isSafeInteger(blockNumber) || blockNumber < 1) return null;
  return {
    transaction: {
      from: transaction.from,
      to: transaction.to,
      value: transaction.value || "0x0",
      data: transaction.input || transaction.data || "0x",
      ...(transaction.gas ? { gas: transaction.gas } : {}),
    },
    block: `0x${(blockNumber - 1).toString(16)}`,
  };
}
