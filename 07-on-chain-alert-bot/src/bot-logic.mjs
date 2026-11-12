const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const DECIMAL = /^\d{1,30}(?:\.\d{1,36})?$/;

export function parseWatchCommand(text) {
  const [command, token, minimum, wallet, extra] = String(text || "").trim().split(/\s+/);
  if (command?.split("@")[0].toLowerCase() !== "/watch" || !ADDRESS.test(token || "") || !DECIMAL.test(minimum || "") || extra !== undefined) return null;
  if (wallet && !ADDRESS.test(wallet)) return null;
  if (!/[1-9]/.test(minimum)) return null;
  return { token, minimum, wallet: wallet?.toLowerCase() || "" };
}

export function decimalToUnits(value, decimals) {
  const text = String(value || "");
  if (!DECIMAL.test(text) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Invalid token amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Use no more than ${decimals} decimal places for this token.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function matchesWatch(event, watch, decimals) {
  if (watch.wallet && event.from.toLowerCase() !== watch.wallet && event.to.toLowerCase() !== watch.wallet) return false;
  return decimalToUnits(event.amount, decimals) >= decimalToUnits(watch.minimum, decimals);
}
