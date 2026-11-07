import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import worker from '../worker/index';
import type { Env } from '../worker/types';
import { openLocalDatabase } from './local-database';

const root = resolve(import.meta.dirname, '..');
mkdirSync(resolve(root, '.local'), { recursive: true });
const { db, close } = openLocalDatabase(resolve(root, '.local/policy.sqlite'));

const keyFileArg = process.argv.indexOf('--key-file');
const keyFile = keyFileArg >= 0 ? process.argv[keyFileArg + 1] : process.env.OPENAI_KEY_FILE;
const key = process.env.OPENAI_API_KEY || (keyFile ? readFileSync(resolve(keyFile), 'utf8').trim() : '');
const port = Number(process.env.PORT || 8787);
const dist = resolve(root, 'dist');
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };
const env: Env = {
  DB: db, OPENAI_API_KEY: key, OPENAI_MODEL: 'gpt-6-luna', ENVIRONMENT: 'development',
  ASSETS: { async fetch(request) {
    let path: string;
    try { path = resolve(dist, '.' + decodeURIComponent(new URL(request.url).pathname)); } catch { return new Response('Not found', { status: 404 }); }
    if (path !== dist && !path.startsWith(dist + sep)) return new Response('Not found', { status: 404 });
    if (!existsSync(path) || !extname(path)) path = resolve(dist, 'index.html');
    try { return new Response(readFileSync(path), { headers: { 'Content-Type': mime[extname(path)] || 'application/octet-stream' } }); }
    catch { return new Response('請先執行 npm run build。', { status: 503 }); }
  } },
};

const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_384) { res.writeHead(413); res.end('Request too large'); return; }
      chunks.push(Buffer.from(chunk));
    }
    const url = `http://${req.headers.host || `127.0.0.1:${port}`}${req.url || '/'}`;
    const request = new Request(url, { method: req.method, headers: req.headers as Record<string, string>, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Buffer.concat(chunks) } : {}) });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Local server error'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Puma政策筆記本機預覽：http://127.0.0.1:${port}（模型${key ? '已連接' : '未設定'}）`));
process.on('SIGTERM', () => server.close(() => { close(); process.exit(0); }));
process.on('SIGINT', () => server.close(() => { close(); process.exit(0); }));
