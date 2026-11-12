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

function searchTerms(question) {
  return [...new Set(String(question).toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter((term) => term.length > 2 && !ignoredTerms.has(term));
}

export function makeSearchFallback(results, question) {
  const terms = searchTerms(question);
  const relevant = results.flatMap((result, index) => {
    try {
      const url = new URL(result.url);
      if (!result.content || url.protocol !== "https:" || url.hostname !== "docs.pharos.xyz") return [];
      const title = plainText(result.title).toLowerCase();
      const content = plainText(result.content).toLowerCase();
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 4 : 0) + (content.includes(term) ? 1 : 0), 0);
      return score ? [{ ...result, score, index }] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3);
  if (!relevant.length) return null;

  const answer = [
    "A direct answer is temporarily unavailable. These matching extracts are from the Pharos docs:",
    ...relevant.map((result) => {
      const content = plainText(result.content);
      const excerpt = content.length > 420 ? `${content.slice(0, 419).trimEnd()}…` : content;
      return `\n${result.title}: ${excerpt}`;
    }),
  ].join("\n");

  return {
    found: true,
    answer: plainText(answer),
    sources: relevant.map(({ title, url }) => ({ title, url })),
    mode: "search-fallback",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to ask a documentation question." });
  }

  const question = req.body && typeof req.body.question === "string" ? req.body.question.trim() : "";
  if (question.length < 4 || question.length > 500) {
    return res.status(400).json({ error: "Enter a question between 4 and 500 characters." });
  }

  let client;
  try {
    client = await callWithRetry(() => connectDocsMcp(), "Connect to Docs MCP", 1);
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
