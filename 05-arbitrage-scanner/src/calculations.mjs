const BPS = 10_000n;

export function parseTokenAmount(value, decimals) {
  const input = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(input)) throw new Error("Trade size must be a positive decimal number.");

  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > decimals) throw new Error(`Trade size supports at most ${decimals} decimal places for this token.`);
  const units = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n) throw new Error("Trade size must be greater than zero.");
  return units;
}

export function constantProductOutput(amountIn, reserveIn, reserveOut, feeBps) {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) throw new Error("Pool reserves and trade amount must be greater than zero.");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps >= Number(BPS)) throw new Error("Pool fee must be between 0 and 9,999 basis points.");

  const feeAdjustedInput = amountIn * BigInt(Number(BPS) - feeBps);
  return (feeAdjustedInput * reserveOut) / (reserveIn * BPS + feeAdjustedInput);
}

export function formatUnits(raw, decimals) {
  return Number(raw) / (10 ** decimals);
}
