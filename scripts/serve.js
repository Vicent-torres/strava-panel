// Servidor local para ver el panel en http://localhost:4321
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.js';

const DIR = path.join(ROOT, 'docs');
const PORT = Number(process.env.PORT) || 4321;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.join(DIR, pathname);
    if (!file.startsWith(DIR + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
        return;
      }
      res
        .writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
        .end(buf);
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Panel en http://localhost:${PORT}`));
