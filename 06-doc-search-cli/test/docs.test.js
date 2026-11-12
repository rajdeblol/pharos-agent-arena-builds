import test from "node:test";
import assert from "node:assert/strict";
import { ANSWER_TIMEOUT_MS, askQuestion, docsPageUrl, excerpt, parseAnswer, parseSearchResults } from "../lib/docs.js";
import { parseArgs } from "../cli.js";

test("parses an answer and prioritizes linked Pharos documentation sources", () => {
  const reply = `Deploy with Foundry. See [the guide](/developer-guide/foundry/deploy).\n\n## Sources\n- [Foundry guide](https://docs.pharos.xyz/developer-guide/foundry/deploy)\n- [Other source](https://docs.pharos.xyz/getting-started/network/pacific-mainnet)`;
  const parsed = parseAnswer(reply);
  assert.equal(parsed.found, true);
  assert.match(parsed.answer, /https:\/\/docs\.pharos\.xyz\/developer-guide\/foundry\/deploy/);
  assert.equal(parsed.sources[0].title, "the guide");
  assert.equal(parsed.sources.length, 2);
});

test("does not treat unsupported, unreferenced text as an answer", () => {
  assert.equal(parseAnswer("I cannot find information about moon cheese.").found, false);
  assert.equal(parseAnswer("A confident but uncited claim.").found, false);
  assert.equal(parseAnswer("").found, false);
});

test("allows the sourced answer tool enough time to return structured guidance", async () => {
  let requestOptions;
  const client = {
    async callTool(_request, _schema, options) {
      requestOptions = options;
      return { content: [{ type: "text", text: "Answer with sources." }] };
    },
  };

  await askQuestion(client, "How do I deploy a contract?");
  assert.equal(requestOptions.timeout, ANSWER_TIMEOUT_MS);
  assert.equal(ANSWER_TIMEOUT_MS, 30_000);
});

test("rejects citations and page URLs outside the official docs host", () => {
  const parsed = parseAnswer("Read [this page](https://example.com/fake).\n\nSources:\n- [Fake](https://example.com/fake)");
  assert.equal(parsed.found, false);
  assert.equal(parsed.sources.length, 0);
  assert.throws(() => docsPageUrl("https://example.com/"), /Only HTTPS pages/);
  assert.equal(docsPageUrl("/getting-started/network/pacific-mainnet"), "https://docs.pharos.xyz/getting-started/network/pacific-mainnet");
});

test("parses MCP search blocks and removes duplicate or foreign links", () => {
  const reply = "Title: Mainnet\nLink: https://docs.pharos.xyz/mainnet\nContent: Chain ID 1672\n\nTitle: Duplicate\nLink: https://docs.pharos.xyz/mainnet\nContent: duplicate\n\nTitle: Foreign\nLink: https://example.com/\nContent: no";
  assert.deepEqual(parseSearchResults(reply), [{ title: "Mainnet", url: "https://docs.pharos.xyz/mainnet", content: "Chain ID 1672" }]);
});

test("limits excerpts and parses CLI question, search, and page commands", () => {
  assert.equal(excerpt("one two three", 7), "one tw…");
  assert.deepEqual(parseArgs(["how", "to", "deploy?"]), { command: "ask", question: "how to deploy?" });
  assert.deepEqual(parseArgs(["search", "wallet", "setup", "--limit", "3"]), { command: "search", query: "wallet setup", limit: 3 });
  assert.equal(parseArgs(["page", "/getting-started/network/pacific-mainnet"]).command, "page");
  assert.throws(() => parseArgs(["search", "wallet", "--limit", "11"]), /1 to 10/);
});
