import { askQuestion, parseAnswer, searchDocumentation } from "../06-doc-search-cli/lib/docs.js";
import { callWithRetry, connectDocsMcp } from "../06-doc-search-cli/lib/mcp.js";

function plainText(markdown) {
  return String(markdown ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

const ignoredTerms = new Set([
  "how", "what", "when", "where", "why", "who", "does", "did", "are", "was", "were",
  "the", "and", "for", "with", "from", "this", "that", "can", "could", "would", "should",
  "you", "your", "into", "about", "have", "has", "get", "use", "using", "pharos", "docs",
]);
const frameworkTerms = new Set(["foundry", "hardhat", "ethers", "viem", "wagmi", "solidity", "web3"]);

function searchTerms(question) {
  return [...new Set(String(question).toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter((term) => term.length > 2 && !ignoredTerms.has(term));
}

export function makeSearchFallback(results, question, resultMode = "search-fallback") {
  const terms = searchTerms(question);
  const requestedFrameworks = terms.filter((term) => frameworkTerms.has(term));
  const uniqueTitles = new Set();
  const relevant = results.flatMap((result, index) => {
    try {
      const url = new URL(result.url);
      if (!result.content || url.protocol !== "https:" || url.hostname !== "docs.pharos.xyz") return [];
      const title = plainText(result.title).toLowerCase();
      const content = plainText(result.content).toLowerCase();
      const path = url.pathname.toLowerCase();
      if (requestedFrameworks.length && !requestedFrameworks.some((term) => title.includes(term) || path.includes(term))) return [];
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 8 : 0) + (path.includes(term) ? 6 : 0) + (content.includes(term) ? 1 : 0), 0);
      const minScore = terms.length > 1 ? 2 : 1;
      return score >= minScore ? [{ ...result, score, index, normalizedTitle: title }] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const bestScore = relevant[0]?.score ?? 0;
  const distinct = relevant.filter((result) => {
    if (result.score < bestScore * 0.9) return false;
    if (uniqueTitles.has(result.normalizedTitle)) return false;
    uniqueTitles.add(result.normalizedTitle);
    return true;
  }).slice(0, 3);
  if (!distinct.length) return null;

  const sources = distinct.map((result) => {
    const content = plainText(result.content)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\s*[-*#>]+\s?/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    const excerpt = content.length > 280 ? `${content.slice(0, 279).trimEnd()}…` : content;
    return { title: result.title, url: result.url, excerpt };
  });

  return {
    found: true,
    answer: "These are the closest matching pages in the Pharos documentation.",
    sources,
    mode: resultMode,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to ask a documentation question." });
  }

  const question = req.body && typeof req.body.question === "string" ? req.body.question.trim() : "";
  const mode = req.body?.mode ?? "answer";
  if (!new Set(["answer", "search"]).has(mode)) {
    return res.status(400).json({ error: "Choose answer or search mode." });
  }
  if (question.length < 4 || question.length > 500) {
    return res.status(400).json({ error: "Enter a question between 4 and 500 characters." });
  }

  let client;
  try {
    client = await callWithRetry(() => connectDocsMcp(), "Connect to Docs MCP", 1);
    if (mode === "search") {
      const results = await callWithRetry(() => searchDocumentation(client, question), "Docs MCP search", 0);
      const searchResult = makeSearchFallback(results, question, "search");
      return res.status(200).json(searchResult ?? {
        found: false,
        answer: "No matching Pharos documentation pages were found.",
        sources: [],
        mode: "search",
      });
    }
    try {
      const reply = await callWithRetry(() => askQuestion(client, question), "Docs MCP question", 0);
      const result = parseAnswer(reply);
      return res.status(200).json({
        found: result.found,
        answer: result.found ? plainText(result.answer) : "No good answer was found in the Pharos documentation.",
        reply: result.found ? undefined : plainText(result.raw),
        sources: result.sources,
      });
    } catch (askError) {
      try {
        const results = await callWithRetry(() => searchDocumentation(client, question), "Docs MCP search", 0);
        const fallback = makeSearchFallback(results, question);
        if (fallback) return res.status(200).json(fallback);
      } catch {
        // Keep the original question failure as the cause shown to the client.
      }
      throw askError;
    }
  } catch {
    return res.status(502).json({ error: "Developer Docs MCP is temporarily unavailable. Try again." });
  } finally {
    await client?.close().catch(() => {});
  }
}
