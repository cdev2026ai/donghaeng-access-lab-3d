import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

createServer((request, response) => {
  const pathname = decodeURIComponent((request.url || '/').split('?')[0]);
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, safePath);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(root, 'index.html');
  response.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`동행 Access Lab 3D: http://127.0.0.1:${port}`);
});
