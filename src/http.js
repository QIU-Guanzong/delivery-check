import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { checkBundle, LIMITS } from './check.js';

export function createApiServer({ secret, maxBodyBytes = LIMITS.inputBytes } = {}) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('A gateway secret of at least 32 characters is required.');
  const digest = value => createHash('sha256').update(value).digest();
  const expected = digest(secret);
  const server = createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/health') return reply(200, { status: 'ok' });
    const supplied = req.headers['x-rapidapi-proxy-secret'];
    if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), expected)) return reply(401, { error: 'UNAUTHORIZED' });
    if (req.url !== '/v1/check') return reply(404, { error: 'NOT_FOUND' });
    if (req.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    if ((req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json' || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) return reply(415, { error: 'JSON_REQUIRED' });
    if (Number(req.headers['content-length']) > maxBodyBytes) return reply(413, { error: 'BODY_LIMIT' });
    let size = 0, finished = false;
    const chunks = [];
    req.on('data', chunk => {
      if (finished) return;
      size += chunk.length;
      if (size > maxBodyBytes) { finished = true; chunks.length = 0; reply(413, { error: 'BODY_LIMIT' }); return; }
      chunks.push(chunk);
    });
    req.on('error', () => { finished = true; chunks.length = 0; });
    req.on('end', () => {
      if (finished) return;
      let input;
      try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { return reply(400, { error: 'INVALID_JSON' }); }
      try { const report = checkBundle(input); reply(report.status === 'INVALID_SPEC' ? 422 : 200, report); }
      catch { reply(500, { error: 'CHECK_FAILED' }); }
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.timeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxConnections = 32;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createApiServer({ secret: process.env.RAPIDAPI_PROXY_SECRET });
  const port = Number(process.env.PORT || 8080);
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Delivery Check API listening on port ${port}`));
}
