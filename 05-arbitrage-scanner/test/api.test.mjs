import test from "node:test";
import assert from "node:assert/strict";
import scan from "../api/scan.mjs";

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("Vercel scan route preserves the POST-only response", async () => {
  const res = response();
  await scan({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
  assert.deepEqual(res.body, { error: "Use POST to run a scan." });
});

test("invalid scan inputs fail closed without changing the error response shape", async () => {
  const res = response();
  await scan({ method: "POST", body: { base: "not-an-address" } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.decision, "SKIP");
  assert.equal(res.body.reason, "A live source check failed, so no simulated plan was prepared.");
  assert.match(res.body.error, /Base token must be a valid EVM address/);
});
