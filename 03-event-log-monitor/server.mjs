import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents } from "./lib/monitor.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(here, "public");
const port = Number(process.env.PORT || 4176);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/events") {
    if (request.method !== "GET") { response.writeHead(405, { allow: "GET" }).end("Method not allowed"); return; }
    try {
      const data = await readEvents({ token: url.searchParams.get("token") || undefined, lookback: url.searchParams.get("lookback") || 200, since: url.searchParams.get("since") });
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(data));
    } catch (error) {
      response.writeHead(502, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Event scan failed." }));
    }
    return;
  }
  if (request.method !== "GET") { response.writeHead(405, { allow: "GET" }).end("Method not allowed"); return; }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safe = normalize(requested).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, "");
  const path = join(publicDir, safe);
  if (!path.startsWith(publicDir)) { response.writeHead(403).end("Forbidden"); return; }
  try { response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream" }).end(await readFile(path)); }
  catch { response.writeHead(404).end("Not found"); }
});
server.listen(port, () => console.log(`Event Log Monitor ready at http://localhost:${port}`));
