import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const adsModule = await import(pathToFileURL(resolve(root, 'netlify/functions/ads.mts')).href);
const commerceModule = await import(pathToFileURL(resolve(root, 'netlify/functions/commerce.mts')).href);
const previewContext = { deploy: { context: 'dev', published: false } };
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

async function serveStatic(path: string, response: import('node:http').ServerResponse) {
  const file = path === '/' ? 'index.html' : path.replace(/^\//, '');
  if (!['index.html', 'preview.js'].includes(file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Nie znaleziono.');
    return;
  }
  try {
    const data = await readFile(resolve(root, file));
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': file === 'index.html' ? 'no-cache' : 'public, max-age=300',
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end('Nie znaleziono.');
  }
}

const server = createServer(async (incoming, outgoing) => {
  const host = incoming.headers.host || 'localhost';
  const proto = String(incoming.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const url = new URL(incoming.url || '/', `${proto}://${host}`);

  if (!url.pathname.startsWith('/api/')) {
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      outgoing.writeHead(405, { Allow: 'GET, HEAD' });
      outgoing.end();
      return;
    }
    await serveStatic(url.pathname, outgoing);
    return;
  }

  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of incoming) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 20_000) {
        outgoing.writeHead(413, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ error: 'Formularz jest zbyt duży.' }));
        return;
      }
      chunks.push(buffer);
    }
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(', '));
      else if (value !== undefined) headers.set(key, value);
    }
    const init: RequestInit & { duplex?: 'half' } = {
      method: incoming.method || 'GET',
      headers,
      ...(body.length ? { body, duplex: 'half' as const } : {}),
    };
    const request = new Request(url, init);
    const handler = url.pathname === '/api/ads' ? adsModule.default : commerceModule.default;
    const result = await handler(request, previewContext);
    const responseHeaders: Record<string, string> = {};
    result.headers.forEach((value, key) => { responseHeaders[key] = value; });
    outgoing.writeHead(result.status, responseHeaders);
    outgoing.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error('Błąd serwera OPKORS:', error);
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    outgoing.end(JSON.stringify({ error: 'Serwer jest chwilowo niedostępny.' }));
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`OPKORS działa na porcie ${port}`));
