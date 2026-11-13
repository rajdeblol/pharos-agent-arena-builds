import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTransaction, buildReplayRequest, decodeRevertData, transactionHashIsValid } from "../src/analysis.mjs";
import { investigateTransaction } from "../src/pharos-mcp.mjs";

const hash = `0x${"a".repeat(64)}`;
const from = `0x${"1".repeat(40)}`;
const to = `0x${"2".repeat(40)}`;

function encodeError(message) {
  const bytes = Buffer.from(message, "utf8").toString("hex");
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
  return `0x08c379a0${"0".repeat(62)}20${(bytes.length / 2).toString(16).padStart(64, "0")}${padded}`;
}

test("validates Pharos transaction hashes", () => {
  assert.equal(transactionHashIsValid(hash), true);
  assert.equal(transactionHashIsValid("0x1234"), false);
  assert.equal(transactionHashIsValid(`0x${"g".repeat(64)}`), false);
});

test("decodes standard revert strings and Solidity panic codes", () => {
  assert.equal(decodeRevertData(encodeError("ERC20: insufficient allowance")), "ERC20: insufficient allowance");
  assert.match(decodeRevertData(`0x4e487b71${"0".repeat(62)}11`), /overflow or underflow/);
});

test("explains a likely out-of-gas failure using receipt evidence", () => {
  const result = analyzeTransaction({
    hash,
    transaction: { from, to, gas: "0x5208" },
    receipt: { status: "0x0", gasUsed: "0x5208", blockNumber: "0x100" },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.diagnosis.type, "out-of-gas");
  assert.match(result.evidence.join(" "), /Gas used: 21,000 of 21,000/);
});

test("explains allowance and token balance reverts with specific fixes", () => {
  const receipt = { status: "0x0", gasUsed: "0x8000" };
  const transaction = { from, to, gas: "0x10000" };
  const allowance = analyzeTransaction({ hash, transaction, receipt, replayError: "execution reverted: ERC20: insufficient allowance" });
  const balance = analyzeTransaction({ hash, transaction, receipt, replayError: "execution reverted: transfer amount exceeds balance" });
  assert.equal(allowance.diagnosis.type, "allowance");
  assert.match(allowance.diagnosis.fix, /Approve/);
  assert.equal(balance.diagnosis.type, "token-balance");
  assert.match(balance.diagnosis.fix, /token balance/);
});

test("invalid gas fields do not crash diagnosis", () => {
  const result = analyzeTransaction({
    hash,
    transaction: { from, to, gas: "not-a-quantity" },
    receipt: { status: "0x0", gasUsed: "also-invalid" },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.diagnosis.type, "contract-revert");
});

test("replays a failed call at the preceding block without adding signing fields", () => {
  assert.deepEqual(buildReplayRequest({ from, to, gas: "0x5208", input: "0x1234", value: "0x0", blockNumber: "0x100" }), {
    transaction: { from, to, value: "0x0", data: "0x1234", gas: "0x5208" },
    block: "0xff",
  });
  assert.equal(buildReplayRequest({ from, to: null, blockNumber: "0x100" }), null);
});

test("fetches transaction and receipt via Chain MCP, then replays only on failure", async () => {
  const calls = [];
  const fakeClient = {
    async callTool(request) {
      calls.push(request.name);
      const data = {
        get_transaction: { from, to, gas: "0x10000", blockNumber: "0x100", value: "0x0", input: "0x" },
        get_transaction_receipt: { status: "0x0", gasUsed: "0x8000", blockNumber: "0x100" },
      };
      if (request.name === "eth_call") throw new Error("execution reverted: transfer amount exceeds balance");
      return { content: [{ type: "text", text: JSON.stringify(data[request.name]) }] };
    },
    async close() {},
  };
  const result = await investigateTransaction(hash, { clientFactory: async () => fakeClient });
  assert.deepEqual(calls, ["get_transaction", "get_transaction_receipt", "eth_call"]);
  assert.equal(result.diagnosis.type, "token-balance");
  assert.equal(result.via, "Pharos Chain MCP");
});

test("does not replay successful transactions", async () => {
  const calls = [];
  const fakeClient = {
    async callTool(request) {
      calls.push(request.name);
      const data = request.name === "get_transaction"
        ? { from, to, gas: "0x10000", value: "0x0" }
        : { status: "0x1", gasUsed: "0x7000" };
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
    async close() {},
  };
  const result = await investigateTransaction(hash, { clientFactory: async () => fakeClient });
  assert.equal(result.diagnosis.type, "success");
  assert.deepEqual(calls, ["get_transaction", "get_transaction_receipt"]);
});
