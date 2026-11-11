import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(target); res.writeHead(200, { 'content-type': types[extname(target)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' }); res.end(data); }
  catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found'); }
});
server.listen(Number(process.env.PORT || 4174), '0.0.0.0', () => console.log(`Policy Gatekeeper ready on ${process.env.PORT || 4174}`));
