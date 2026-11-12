import { askQuestion, parseAnswer } from "../06-doc-search-cli/lib/docs.js";
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
    client = await connectDocsMcp();
    const reply = await callWithRetry(() => askQuestion(client, question), "Docs MCP question", 1);
    const result = parseAnswer(reply);
    return res.status(200).json({
      found: result.found,
      answer: result.found ? plainText(result.answer) : "No good answer was found in the Pharos documentation.",
      reply: result.found ? undefined : plainText(result.raw),
      sources: result.sources,
    });
  } catch {
    return res.status(502).json({ error: "Developer Docs MCP is temporarily unavailable. Try again." });
  } finally {
    await client?.close().catch(() => {});
  }
}
