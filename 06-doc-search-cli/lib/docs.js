import { REQUEST_TIMEOUT_MS } from "./mcp.js";

export const DOCS_ORIGIN = "https://docs.pharos.xyz";
export const ANSWER_TIMEOUT_MS = 30_000;
const MAX_SOURCES = 5;
const NO_ANSWER = /\b(?:cannot|can't|could not|couldn't|unable to) find\b|\bno (?:relevant )?information\b|\bnot (?:covered|documented)\b/i;

function approvedDocsUrl(href) {
  try {
    const url = new URL(href, DOCS_ORIGIN);
    return url.protocol === "https:" && url.hostname === "docs.pharos.xyz" ? url.href : null;
  } catch {
    return null;
  }
}

function parseSourceLinks(text) {
  const seen = new Set();
  return [...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)]
    .map(([, title, href]) => ({ title: title.trim(), url: approvedDocsUrl(href) }))
    .filter((source) => source.url && !seen.has(source.url) && seen.add(source.url))
    .slice(0, MAX_SOURCES);
}

export function parseAnswer(reply) {
  const text = String(reply ?? "").trim();
  const sourceHeading = /^\s*#{0,3}\s*(?:sources|references)\s*:?[ \t]*$/im;
  const splitAt = text.search(sourceHeading);
  const answerMarkdown = (splitAt < 0 ? text : text.slice(0, splitAt)).trim();
  const sources = parseSourceLinks(text);
  const answer = answerMarkdown.replace(/\]\((\/[^)\s]*)\)/g, (_, path) => {
    const url = approvedDocsUrl(path);
    return url ? `](${url})` : "]()";
  });
  const answerText = answer.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`#]/g, "");
  const found = sources.length > 0 && !NO_ANSWER.test(answerText);

  return { answer, sources, found, raw: text };
}

export function parseSearchResults(reply) {
  const text = String(reply ?? "").trim();
  let records = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) records = parsed;
    else if (Array.isArray(parsed.results)) records = parsed.results;
  } catch {
    records = text.split(/\n(?=Title: )/).map((block) => ({
      title: block.match(/^Title:\s*(.*)$/m)?.[1]?.trim(),
      url: block.match(/^Link:\s*(.*)$/m)?.[1]?.trim(),
      content: block.split(/^Content:\s*/m)[1]?.trim() ?? "",
    }));
  }

  const seen = new Set();
  return records.map((record) => {
    const url = approvedDocsUrl(record.url ?? record.link);
    return {
      title: String(record.title ?? "Untitled page").trim(),
      url,
      content: String(record.content ?? record.snippet ?? "").trim(),
    };
  }).filter((record) => record.url && !seen.has(record.url) && seen.add(record.url));
}

export function docsPageUrl(input) {
  const url = approvedDocsUrl(input);
  if (!url) throw new Error(`Only HTTPS pages on ${DOCS_ORIGIN} are allowed.`);
  return url;
}

export function excerpt(text, maxLength = 220) {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

export async function askQuestion(client, question) {
  return callTool(client, "askQuestion", { question }, ANSWER_TIMEOUT_MS);
}

export async function searchDocumentation(client, query) {
  return parseSearchResults(await callTool(client, "searchDocumentation", { query }));
}

export async function getPage(client, url) {
  return callTool(client, "getPage", { url });
}

async function callTool(client, name, args, timeout = REQUEST_TIMEOUT_MS) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout });
  const text = (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n").trim();
  if (result.isError) throw new Error(text || `${name} failed in Developer Docs MCP.`);
  if (!text) throw new Error(`${name} returned an empty response.`);
  return text;
}
