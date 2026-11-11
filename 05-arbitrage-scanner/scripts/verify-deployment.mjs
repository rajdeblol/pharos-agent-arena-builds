import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vercel = JSON.parse(await readFile(resolve(projectRoot, "vercel.json"), "utf8"));
const route = await readFile(resolve(projectRoot, "api/scan.mjs"), "utf8");

assert.equal(vercel.outputDirectory, "public", "Vercel must serve the existing public directory.");
assert.ok(vercel.functions?.["api/scan.mjs"], "Vercel must configure the /api/scan function.");
assert.match(route, /export\s*\{\s*default\s*\}\s*from\s*["']\.\.\/src\/scan-handler\.mjs["']/,
  "The Vercel route adapter must point to the scan handler module.");
await Promise.all([
  readFile(resolve(projectRoot, "public/index.html")),
  readFile(resolve(projectRoot, "src/scan-handler.mjs")),
  readFile(resolve(projectRoot, "src/calculations.mjs")),
]);

console.log("Vercel static output and /api/scan route configuration are consistent.");
