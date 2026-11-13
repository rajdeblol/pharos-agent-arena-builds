export const PHAROS_CHAIN_ID = 1672;
export const PHAROSSCAN = "https://www.pharosscan.xyz";
export const CIRCLE_USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815";
export const CIRCLE_USDC_SOURCE = "https://www.circle.com/blog/now-available-usdc-cctp-on-pharos";
export const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

const SCORE = { medium: 20, high: 55, critical: 100 };

function addSignal(signals, severity, code, title, detail, evidence = "") {
  signals.push({ severity, code, title, detail, evidence });
}

function asBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value !== "string" || !/^(?:0x[0-9a-f]+|\d+)$/i.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

function hasUnlimitedApproval(approvals = []) {
  const maxUint = (1n << 256n) - 1n;
  return approvals.some((approval) => {
    const amount = asBigInt(approval.allowance ?? approval.value);
    return amount !== null && amount >= maxUint / 2n;
  });
}

function countForDirection(transfers, direction) {
  return transfers.filter((transfer) => transfer.direction === direction).length;
}

export function assessWallet({
  address,
  blockNumber,
  bytecode = "0x",
  balance = "0x0",
  nonce = "0x0",
  transfers = [],
  approvals = [],
  blacklist = null,
  paused = null,
  implementation = null,
  lookback = 1000,
  historyAvailable = true,
}) {
  const normalizedAddress = address.toLowerCase();
  const code = typeof bytecode === "string" ? bytecode.toLowerCase() : "";
  const isContract = code.length > 2 && !/^0x0*$/.test(code);
  const nativeBalance = asBigInt(balance);
  const transactionCount = asBigInt(nonce);
  const isOfficialUsdc = normalizedAddress === CIRCLE_USDC;
  const inbound = countForDirection(transfers, "in");
  const outbound = countForDirection(transfers, "out");
  const selfTransfers = transfers.filter((transfer) => transfer.direction === "self").length;
  const signals = [];

  if (BURN_ADDRESSES.has(normalizedAddress)) {
    addSignal(signals, "critical", "burn-address", "Known zero or burn address", "Assets sent to this address are generally unrecoverable. Verify the recipient carefully before sending.", normalizedAddress);
  }

  if (blacklist === true) {
    addSignal(signals, "high", "usdc-blacklist", "Circle USDC currently blocks this address", "The official Pharos USDC contract reports this address as blacklisted. USDC transfers involving it may be rejected.", `USDC: ${CIRCLE_USDC}`);
  } else if (blacklist === false) {
    addSignal(signals, "info", "usdc-not-blacklisted", "Not on Circle USDC’s current blacklist", "The current USDC contract read returned false. This only covers Circle USDC and is not a general sanctions or safety check.");
  } else {
    addSignal(signals, "info", "usdc-blacklist-unavailable", "USDC blacklist check unavailable", "The checker could not read Circle USDC’s blacklist function, so this signal is unknown rather than clear.");
  }

  if (isOfficialUsdc) {
    addSignal(signals, "info", "official-usdc", "Official Circle USDC contract on Pharos", "Circle lists this address as its USDC contract on Pharos. This identifies the asset; it does not guarantee every interaction is safe.", CIRCLE_USDC_SOURCE);
  } else if (isContract) {
    addSignal(signals, "medium", "unlisted-contract", "Contract is not in the built-in official asset list", "Chain MCP confirms bytecode is present, but this checker cannot verify source code or establish who operates this contract. Treat unknown contracts with care.", `${code.length / 2 - 1} bytes of code`);
  } else {
    addSignal(signals, "info", "externally-owned-account", "No contract bytecode at this address", "The current Pharos code read is empty, consistent with a standard wallet address.", "eth_getCode returned 0x");
  }

  if (paused === true) {
    addSignal(signals, "high", "paused-contract", "Contract reports that it is paused", "The contract’s paused() read returned true. Its guarded operations may be unavailable until it is unpaused.");
  }

  if (implementation && !/^0x0*$/.test(implementation)) {
    addSignal(signals, isOfficialUsdc ? "info" : "medium", "upgradeable-proxy", "Upgradeable proxy slot is populated", isOfficialUsdc
      ? "This official Circle token uses an upgradeable implementation; that is an administrative trust consideration, not evidence of malicious behavior."
      : "An administrator may be able to change the logic behind this contract. Review its upgrade authority before interacting.", implementation);
  }

  if (transactionCount === 0n && transfers.length === 0 && !isContract && !isOfficialUsdc) {
    addSignal(signals, "medium", "no-observed-history", "No wallet activity observed in the checked data", `The wallet nonce is zero and no Circle USDC transfers were found in the latest ${lookback.toLocaleString()} blocks. It may be new or simply inactive; this alone does not indicate malicious behavior.`);
  } else if (!isContract && transactionCount !== null && transactionCount > 0n) {
    addSignal(signals, "info", "wallet-has-history", "Wallet has prior transaction activity", `Pharos reports a nonce of ${transactionCount.toLocaleString()}. Nonce counts sent transactions, not total wallet activity.`);
  }

  if (inbound >= 2 && outbound === 0 && !isContract && !isOfficialUsdc) {
    addSignal(signals, "medium", "inbound-only", "Recent USDC activity is inbound-only", `Found ${inbound} incoming and no outgoing USDC transfers in the latest ${lookback.toLocaleString()} blocks. This narrow sample may not represent the wallet’s full history.`);
  } else if (inbound + outbound > 0) {
    addSignal(signals, "info", "recent-usdc-activity", "Recent USDC transfer activity found", `${inbound} incoming, ${outbound} outgoing, and ${selfTransfers} self-directed transfer event(s) in the checked window.`);
  }

  if (hasUnlimitedApproval(approvals)) {
    addSignal(signals, "medium", "large-approval", "A current USDC approval is unusually large", "A spender in recent Approval events still has a very large allowance. Review and revoke approvals you do not recognize.", `${approvals.length} active spender allowance(s) checked`);
  } else if (approvals.length > 0) {
    addSignal(signals, "info", "approvals-checked", "Recent USDC approvals checked", `${approvals.length} active spender allowance(s) checked; none met the unlimited-approval threshold.`);
  }

  if (!historyAvailable) {
    addSignal(signals, "info", "history-incomplete", "Transfer history could not be fully checked", "The verdict uses available live reads, but recent USDC transfer or approval history is incomplete.");
  }

  const score = Math.min(100, signals.reduce((total, signal) => total + (SCORE[signal.severity] ?? 0), 0));
  const hasCritical = signals.some((signal) => signal.severity === "critical");
  const hasHigh = signals.some((signal) => signal.severity === "high");
  const checksComplete = historyAvailable && blacklist !== null;
  const riskLevel = hasCritical || hasHigh || score >= 50 ? "high" : score >= 15 || !checksComplete ? "medium" : "low";
  const recommendation = riskLevel === "high"
    ? "Pause before sending or approving. Confirm the address and the specific high-risk finding through an independent source."
    : riskLevel === "medium"
      ? "Review the cautions and confirm the address, contract, and approval details before continuing."
      : "No major red flags appeared in the checks available here. This is not a guarantee that the address is safe.";

  const displayBalance = nativeBalance === null ? "Unknown" : `${formatUnits(nativeBalance, 18)} PROS`;
  return {
    address: normalizedAddress,
    chainId: PHAROS_CHAIN_ID,
    blockNumber: blockNumber ?? null,
    riskLevel,
    riskScore: score,
    recommendation,
    summary: riskLevel === "high" ? "Several strong warning signals need attention." : riskLevel === "medium" ? "Some checks need a closer look." : "No major warning signals were found in the checks completed.",
    signals,
    metrics: {
      addressType: isContract ? "Contract" : "Wallet",
      nativeBalance: displayBalance,
      transactionCount: transactionCount === null ? "Unknown" : transactionCount.toLocaleString(),
      recentUsdcTransfers: `${inbound + outbound + selfTransfers}`,
      checkedBlocks: lookback,
      officialAsset: isOfficialUsdc ? "Circle USDC on Pharos" : null,
    },
    coverage: checksComplete ? "complete" : "partial",
    explorerUrl: `${PHAROSSCAN}/address/${normalizedAddress}`,
    sources: [
      { title: "Pharos Chain MCP", url: "https://github.com/PharosNetwork/pharos-mcp" },
      ...(isOfficialUsdc ? [{ title: "Circle: USDC on Pharos", url: CIRCLE_USDC_SOURCE }] : []),
    ],
    readOnly: true,
  };
}

export function formatUnits(value, decimals) {
  const amount = asBigInt(value);
  if (amount === null) return "Unknown";
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole.toLocaleString()}.${fraction}` : whole.toLocaleString();
}

export function isValidAddress(address) {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export function decodeBool(result) {
  if (typeof result === "boolean") return result;
  if (typeof result === "number") return result !== 0;
  if (typeof result !== "string") return null;
  if (/^(?:0x)?0+$/i.test(result)) return false;
  if (/^(?:0x)?0*1$/i.test(result)) return true;
  return null;
}

export function getAddressTopic(address) {
  return `0x${address.toLowerCase().slice(2).padStart(64, "0")}`;
}

export function classifyTransfer(log, address) {
  const sender = typeof log?.topics?.[1] === "string" ? `0x${log.topics[1].slice(-40).toLowerCase()}` : "";
  const recipient = typeof log?.topics?.[2] === "string" ? `0x${log.topics[2].slice(-40).toLowerCase()}` : "";
  const target = address.toLowerCase();
  if (sender === target && recipient === target) return "self";
  if (sender === target) return "out";
  if (recipient === target) return "in";
  return null;
}

export function extractApproval(log) {
  const spender = typeof log?.topics?.[2] === "string" ? `0x${log.topics[2].slice(-40).toLowerCase()}` : "";
  const amount = typeof log?.data === "string" ? log.data : "";
  return isValidAddress(spender) && /^0x[0-9a-f]{64}$/i.test(amount) ? { spender, value: amount } : null;
}
