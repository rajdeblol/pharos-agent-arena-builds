import test from "node:test";
import assert from "node:assert/strict";
import {
  assessWallet,
  CIRCLE_USDC,
  classifyTransfer,
  decodeBool,
  extractApproval,
  formatUnits,
  getAddressTopic,
  isValidAddress,
} from "../src/risk.mjs";
import { scanAddress } from "../src/pharos-mcp.mjs";
import handler from "../../api/wallet-risk-checker.mjs";

const burn = "0x000000000000000000000000000000000000dEaD";
const wallet = "0x1234567890abcdef1234567890abcdef12345678";
const other = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

test("validates EVM addresses and builds padded log topics", () => {
  assert.equal(isValidAddress(wallet), true);
  assert.equal(isValidAddress("0x1234"), false);
  assert.equal(getAddressTopic(wallet), `0x${wallet.slice(2).padStart(64, "0")}`);
});

test("decodes boolean values from eth_call responses", () => {
  assert.equal(decodeBool(`0x${"0".repeat(64)}`), false);
  assert.equal(decodeBool(`0x${"0".repeat(63)}1`), true);
  assert.equal(decodeBool("execution reverted"), null);
});

test("formats native token quantities without floating point", () => {
  assert.equal(formatUnits("1234567890123456789", 18), "1.234567890123456789");
  assert.equal(formatUnits("0x0", 18), "0");
});

test("classifies transfer log directions", () => {
  const log = { topics: ["0x", getAddressTopic(wallet), getAddressTopic(other)] };
  assert.equal(classifyTransfer(log, wallet), "out");
  assert.equal(classifyTransfer(log, other), "in");
});

test("extracts approval spender and amount from an ERC-20 event", () => {
  const approval = extractApproval({ topics: ["0x", getAddressTopic(wallet), getAddressTopic(other)], data: `0x${"f".repeat(64)}` });
  assert.equal(approval.spender, other);
  assert.equal(approval.value, `0x${"f".repeat(64)}`);
});

test("identifies official Circle USDC and still reports its independent risk signals", () => {
  const report = assessWallet({ address: CIRCLE_USDC, blockNumber: 123, bytecode: "0x6001", nonce: "0x0", balance: "0x0", blacklist: true, paused: null, implementation: other });
  assert.equal(report.riskLevel, "high");
  assert.equal(report.metrics.officialAsset, "Circle USDC on Pharos");
  assert.equal(report.signals.some((signal) => signal.code === "usdc-blacklist"), true);
  assert.equal(report.sources.some((source) => source.url.includes("circle.com")), true);
});

test("a historically active wallet with no warning signals receives a low result", () => {
  const report = assessWallet({ address: wallet, blockNumber: 123, bytecode: "0x", nonce: "0x4", balance: "0x1234", blacklist: false, transfers: [{ direction: "in" }, { direction: "out" }] });
  assert.equal(report.riskLevel, "low");
  assert.match(report.recommendation, /not a guarantee/i);
});

test("burn address receives a high risk result with an explicit reason", () => {
  const report = assessWallet({ address: burn, blockNumber: 123, bytecode: "0x", nonce: "0x0", balance: "0x0", blacklist: false, transfers: [] });
  assert.equal(report.riskLevel, "high");
  assert.match(report.signals.find((signal) => signal.code === "burn-address").detail, /unrecoverable/i);
});

test("uncertain history cannot produce a green verdict", () => {
  const report = assessWallet({ address: wallet, blockNumber: 123, bytecode: "0x", nonce: "0x0", balance: "0x10", blacklist: null, historyAvailable: false });
  assert.equal(report.riskLevel, "medium");
  assert.equal(report.coverage, "partial");
});

test("flags current unlimited USDC approvals and inbound-only history", () => {
  const approvals = [{ spender: other, allowance: `0x${"f".repeat(64)}` }];
  const report = assessWallet({ address: wallet, blockNumber: 123, bytecode: "0x", nonce: "0x2", balance: "0x0", blacklist: false, transfers: [{ direction: "in" }, { direction: "in" }], approvals });
  assert.equal(report.riskLevel, "medium");
  assert.equal(report.signals.some((signal) => signal.code === "large-approval"), true);
  assert.equal(report.signals.some((signal) => signal.code === "inbound-only"), true);
});

test("reads address data at one pinned block and queries event windows", async () => {
  const calls = [];
  const code = "0x";
  const fakeClient = {
    async callTool(request) {
      calls.push(request);
      const { name, arguments: args } = request;
      const results = {
        get_block_number: "0x3e8",
        get_code: code,
        get_balance: { balance: "1.25", balanceWei: "1250000000000000000", balanceHex: "0x1158e460913d0000" },
        get_transaction_count: "0x1",
        eth_call: "0x0",
        get_storage_at: `0x${"0".repeat(64)}`,
        get_logs: [],
      };
      if (name === "get_logs") assert.equal(BigInt(args.toBlock) - BigInt(args.fromBlock), 999n);
      return { content: [{ type: "text", text: JSON.stringify(results[name]) }] };
    },
    async close() {},
  };
  const report = await scanAddress(wallet, { clientFactory: async () => fakeClient });
  assert.equal(report.blockNumber, 1000);
  assert.equal(report.riskLevel, "low");
  assert.equal(report.metrics.nativeBalance, "1.25 PROS");
  assert.equal(calls.filter((call) => call.name === "get_logs").length, 3);
  assert.equal(calls.filter((call) => call.name === "eth_call").every((call) => call.arguments.block === "0x3e8"), true);
});

test("API rejects non-POST methods and malformed addresses", async () => {
  async function invoke(method, body) {
    const response = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.code = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await handler({ method, body }, response);
    return response;
  }
  const method = await invoke("GET", {});
  const invalid = await invoke("POST", { address: "not-an-address" });
  assert.equal(method.code, 405);
  assert.equal(method.headers.Allow, "POST");
  assert.equal(invalid.code, 400);
});
