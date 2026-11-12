import test from "node:test";
import assert from "node:assert/strict";
import { decimalToUnits, matchesWatch, parseWatchCommand } from "../src/bot-logic.mjs";
import { buildTelegramMessage, validateTelegramCredentials } from "../src/telegram.mjs";

const botToken = "123456789:abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const chatId = "987654321";
const tx = `0x${"a".repeat(64)}`;
const event = {
  id: `${tx}:4`, tx, logIndex: 4, block: 250,
  from: `0x${"1".repeat(40)}`, to: `0x${"2".repeat(40)}`,
  token: `0x${"3".repeat(40)}`, amount: "25000.125", symbol: "USDC", kind: "TRANSFER",
};

test("validates Telegram credentials without exposing them", () => {
  assert.deepEqual(validateTelegramCredentials(botToken, chatId), { botToken, chatId });
  assert.deepEqual(validateTelegramCredentials(botToken, "@pharos_alerts"), { botToken, chatId: "@pharos_alerts" });
  assert.throws(() => validateTelegramCredentials("not-a-token", chatId), /valid Telegram bot token/);
  assert.throws(() => validateTelegramCredentials(botToken, "https://attacker.test"), /valid Telegram chat ID/);
});

test("formats a sourced Telegram transfer alert with a stable event ID", () => {
  const message = buildTelegramMessage(event, "10000");
  assert.match(message, /25000\.125 USDC/);
  assert.match(message, /Minimum: 10000 USDC/);
  assert.match(message, new RegExp(`1672:${tx}:4`));
  assert.match(message, new RegExp(`https:\\/\\/www\\.pharosscan\\.xyz\\/tx\\/${tx}`));
});

test("parses configurable watch commands and optional wallet filters", () => {
  const token = `0x${"3".repeat(40)}`;
  const wallet = `0x${"4".repeat(40)}`;
  assert.deepEqual(parseWatchCommand(`/watch ${token} 10000`), { token, minimum: "10000", wallet: "" });
  assert.deepEqual(parseWatchCommand(`/watch ${token} 0.05 ${wallet}`), { token, minimum: "0.05", wallet });
  assert.deepEqual(parseWatchCommand(`/watch@pharos_alert_bot ${token} 12`), { token, minimum: "12", wallet: "" });
  assert.equal(parseWatchCommand(`/watch ${token} 1 https://evil.test`), null);
  assert.equal(parseWatchCommand(`/watch ${token} 0`), null);
  assert.equal(parseWatchCommand(`/watch ${token} 1 extra extra`), null);
});

test("uses exact token units to check minimum transfer and wallet scope", () => {
  assert.equal(decimalToUnits("12.034", 3), 12034n);
  assert.equal(matchesWatch(event, { minimum: "25000.125", wallet: "" }, 3), true);
  assert.equal(matchesWatch(event, { minimum: "25000.126", wallet: "" }, 3), false);
  assert.equal(matchesWatch(event, { minimum: "1", wallet: `0x${"9".repeat(40)}` }, 3), false);
  assert.throws(() => decimalToUnits("1.2345", 3), /decimal places/);
});
