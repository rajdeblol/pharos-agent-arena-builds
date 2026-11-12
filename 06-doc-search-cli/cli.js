#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { askQuestion, docsPageUrl, excerpt, getPage, parseAnswer, searchDocumentation } from "./lib/docs.js";
import { callWithRetry, connectDocsMcp, REQUEST_TIMEOUT_MS } from "./lib/mcp.js";

const HELP = `pharos-docs — search Pharos developer documentation with Developer Docs MCP

Usage:
  pharos-docs "<natural-language question>"
  pharos-docs search <keywords> [--limit <1-10>]
  pharos-docs page <docs-url-or-path>

Options:
  -h, --help   Show this help

Examples:
  pharos-docs "how do I deploy a contract with Foundry?"
  pharos-docs "what is the Pacific Mainnet chain ID?"
  pharos-docs search "wallet connect"
`;

export function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return { command: "help" };

  if (argv[0] === "search") {
    const words = [];
    let limit = 5;
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === "--limit") {
        limit = Number(argv[index + 1]);
        if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("--limit must be a whole number from 1 to 10.");
        index += 1;
      } else if (argv[index].startsWith("--")) {
        throw new Error(`Unknown option: ${argv[index]}`);
      } else words.push(argv[index]);
    }
    const query = words.join(" ").trim();
    if (!query) throw new Error("search needs keywords.");
    return { command: "search", query, limit };
  }

  if (argv[0] === "page") {
    const input = argv.slice(1).join(" ").trim();
    if (!input) throw new Error("page needs a docs URL or path.");
    return { command: "page", url: docsPageUrl(input) };
  }

  if (argv.some((value) => value.startsWith("--"))) throw new Error("Only --help is available for questions.");
  const question = argv.join(" ").trim();
  if (!question) throw new Error("Enter a question in quotes.");
  return { command: "ask", question };
}

function printAnswer(question, reply) {
  const result = parseAnswer(reply);
  if (!result.found) {
    console.log(`No good answer found in the Pharos docs for: ${question}\n`);
    if (result.raw) console.log(`Docs MCP reply: ${result.raw}\n`);
    console.log('Try another query, for example: pharos-docs search "<keywords>"');
    return;
  }

  console.log(`${result.answer}\n\nSources:`);
  result.sources.forEach((source, index) => console.log(`  ${index + 1}. ${source.title}\n     ${source.url}`));
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === "help") {
    console.log(HELP);
    return;
  }

  const client = await connectDocsMcp();
  try {
    if (options.command === "ask") {
      const reply = await callWithRetry(() => askQuestion(client, options.question), "Docs MCP question");
      printAnswer(options.question, reply);
    } else if (options.command === "search") {
      const results = await callWithRetry(() => searchDocumentation(client, options.query), "Docs MCP search");
      const matches = results.slice(0, options.limit);
      if (matches.length === 0) {
        console.log(`No documentation results found for: ${options.query}`);
        return;
      }
      matches.forEach((result, index) => {
        console.log(`${index + 1}. ${result.title}\n   ${result.url}`);
        if (result.content) console.log(`   ${excerpt(result.content)}\n`);
      });
    } else {
      console.log(await callWithRetry(() => getPage(client, options.url), "Docs MCP page read"));
    }
  } finally {
    await client.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const timedOut = /timed? ?out/i.test(error.message);
    console.error(`pharos-docs: ${error.message}${timedOut ? ` (request timeout: ${REQUEST_TIMEOUT_MS / 1000}s)` : ""}`);
    process.exitCode = 1;
  });
}
