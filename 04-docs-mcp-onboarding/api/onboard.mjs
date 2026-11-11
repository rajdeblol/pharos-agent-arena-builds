import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.PHAROS_DOCS_MCP_URL || "https://docs.pharos.xyz/~gitbook/mcp";
const STEPS = {
  1: {
    title: "Find the first step",
    question: "I am starting from zero on ai.pharos.xyz. Using only the Pharos developer docs, give me a concise first-session path: account/setup, first agent or skill, and one safe way to try it.",
  },
  2: {
    title: "Try the documented skill route",
    question: "What exact steps and tool/API calls do the docs give for creating and running a first SkillEngine skill on ai.pharos.xyz? Include required config fields and a minimal example.",
  },
  3: {
    title: "Try a read-only chain query",
    question: "How do I make my first read-only on-chain query with Pharos Chain MCP? Give exact tool names and argument shapes for chain info, contract reads, and event logs.",
  },
  4: {
    title: "Ask how to share proof",
    question: "How do I create a shareable link from ai.pharos.xyz to prove my completed onboarding to the Pharos Agent Arena? Give the exact steps in that product.",
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to run one of the recorded onboarding questions." });
  }

  const step = STEPS[String(req.body?.step)];
  if (!step) return res.status(400).json({ error: "Choose one of the four listed onboarding steps." });

  const client = new Client({ name: "pharos-docs-onboarding-demo", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));
    const result = await client.callTool({
      name: "askQuestion",
      arguments: { question: step.question },
    });
    const answer = result.content
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n");

    if (result.isError) throw new Error(answer || "Docs MCP could not answer that question.");
    if (!answer) throw new Error("Docs MCP returned no text for this question.");

    return res.status(200).json({
      step: String(req.body.step),
      title: step.title,
      question: step.question,
      answer,
      tool: "askQuestion",
      endpoint: MCP_URL,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Docs MCP request failed." });
  } finally {
    await client.close().catch(() => {});
  }
}
