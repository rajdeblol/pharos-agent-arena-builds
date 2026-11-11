import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { readContractState } from "./lib/pharos-reader.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(here, "public");
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Request body must be valid JSON.")); }
    });
    request.on("error", reject);
  });
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requested).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, "");
  const fullPath = join(publicDir, safePath);
  if (!fullPath.startsWith(publicDir)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const content = await readFile(fullPath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(fullPath)] || "application/octet-stream",
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "POST" && url.pathname === "/api/read") {
    try {
      const body = await readBody(request);
      const result = await readContractState(body.address);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "The Pharos read failed." });
    }
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET, POST" }).end("Method not allowed");
    return;
  }
  await serveStatic(decodeURIComponent(url.pathname), response);
});

server.listen(port, () => {
  console.log(`Contract Field Notes is ready at http://localhost:${port}`);
});
