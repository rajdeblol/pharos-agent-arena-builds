import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadLocalSecrets(directory) {
  let content;
  try { content = await readFile(join(directory, ".env.local"), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].replace(/^(?:"([^"]*)"|'([^']*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
    process.env[match[1]] = value;
  }
}
