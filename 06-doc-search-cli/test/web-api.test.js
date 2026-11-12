import test from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/docs-search.mjs";

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("demo API is POST-only", async () => {
  const res = response();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("demo API rejects missing and oversized questions before opening MCP", async () => {
  for (const question of ["", "abc", "x".repeat(501)]) {
    const res = response();
    await handler({ method: "POST", body: { question } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /between 4 and 500 characters/);
  }
});
