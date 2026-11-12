import test from "node:test";
import assert from "node:assert/strict";
import handler, { makeSearchFallback } from "../../api/docs-search.mjs";

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

test("demo API rejects unsupported search modes before opening MCP", async () => {
  const res = response();
  await handler({ method: "POST", body: { question: "Foundry setup guide", mode: "execute" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Choose answer or search mode/);
});

test("search fallback returns only sourced extracts and approved documentation URLs", () => {
  const fallback = makeSearchFallback([
    { title: "Foundry deployment", url: "https://docs.pharos.xyz/foundry", content: "Run forge script to deploy." },
    { title: "Unrelated page", url: "https://docs.pharos.xyz/unrelated", content: "A page about wallet setup." },
    { title: "Foreign result", url: "https://example.com/fake", content: "Ignore this." },
    { title: "Empty result", url: "https://docs.pharos.xyz/empty", content: "" },
  ], "How do I deploy a contract with Foundry?");

  assert.equal(fallback.mode, "search-fallback");
  assert.equal(fallback.sources.length, 1);
  assert.equal(fallback.sources[0].excerpt, "Run forge script to deploy.");
  assert.match(fallback.sources[0].excerpt, /Run forge script to deploy/);
  assert.equal(makeSearchFallback([{ title: "No excerpt", url: "https://docs.pharos.xyz/page", content: "" }], "Foundry deploy"), null);
});

test("search results rank the matching framework page and remove repeated titles", () => {
  const results = makeSearchFallback([
    { title: "Write Your First Uniswap Contract", url: "https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-uniswap-contract", content: "Hardhat deployment steps for a contract." },
    { title: "Write Your First Uniswap Contract", url: "https://docs.pharos.xyz/developer-guide/foundry/write-your-first-uniswap-contract", content: "Foundry deployment steps using forge script." },
    { title: "Canonical Contracts", url: "https://docs.pharos.xyz/getting-started/canonical-contracts", content: "A list of canonical contract addresses." },
  ], "How do I deploy a contract with Foundry?", "search");

  assert.equal(results.mode, "search");
  assert.deepEqual(results.sources.map(({ url }) => url), [
    "https://docs.pharos.xyz/developer-guide/foundry/write-your-first-uniswap-contract",
  ]);
});
