import test from "node:test";
import assert from "node:assert/strict";
import { constantProductOutput, formatUnits, parseTokenAmount } from "../src/calculations.mjs";

test("parses token amounts exactly without floating point rounding", () => {
  assert.equal(parseTokenAmount("0.123456789012345678", 18), 123456789012345678n);
  assert.equal(parseTokenAmount("1", 6), 1_000_000n);
  assert.equal(parseTokenAmount("0.000001", 6), 1n);
});

test("rejects malformed, negative, zero, and over-precision token amounts", () => {
  for (const amount of ["0", "-1", "1e-6", ".5", "1.", "abc"]) {
    assert.throws(() => parseTokenAmount(amount, 18));
  }
  assert.throws(() => parseTokenAmount("0.0000001", 6), /decimal places/);
});

test("calculates constant-product output with fee using integer arithmetic", () => {
  assert.equal(constantProductOutput(100n, 1_000n, 1_000n, 0), 90n);
  assert.equal(constantProductOutput(1_000n, 1_000n, 1_000n, 100), 497n);
});

test("rejects invalid reserves, amounts, and fees", () => {
  assert.throws(() => constantProductOutput(0n, 1n, 1n, 30));
  assert.throws(() => constantProductOutput(1n, 0n, 1n, 30));
  assert.throws(() => constantProductOutput(1n, 1n, 1n, -1));
  assert.throws(() => constantProductOutput(1n, 1n, 1n, 10_000));
});

test("formats raw units using token decimals", () => {
  assert.equal(formatUnits(123456n, 3), 123.456);
});
