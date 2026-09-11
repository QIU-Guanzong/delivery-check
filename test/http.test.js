import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createApiServer } from '../src/http.js';

const secret = 'test-only-secret-not-a-real-key-123456';
const input = { requirements: [{ name: 'a.txt', kind: 'text', maxBytes: 20 }], files: [{ name: 'a.txt', content: 'hello' }] };
async function fixture(t, options = {}) {
  const server = createApiServer({ secret, ...options }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
function post(url, body, headers = {}) { return fetch(url + '/v1/check', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rapidapi-proxy-secret': secret, ...headers }, body: JSON.stringify(body) }); }
test('HTTP adapter refuses missing gateway configuration', () => { assert.throws(() => createApiServer(), /secret/); });
test('HTTP adapter checks gateway identity before parsing input', async t => { const url = await fixture(t); const res = await post(url, input, { 'x-rapidapi-proxy-secret': 'wrong' }); assert.equal(res.status, 401); assert.deepEqual(await res.json(), { error: 'UNAUTHORIZED' }); });
test('HTTP adapter returns real PASS and FAIL reports with no cache', async t => {
  const url = await fixture(t); let res = await post(url, input); assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store'); assert.equal((await res.json()).status, 'PASS');
  res = await post(url, { ...input, files: [] }); assert.equal(res.status, 200); assert.equal((await res.json()).status, 'FAIL');
});
test('HTTP adapter distinguishes invalid contracts, JSON and media', async t => {
  const url = await fixture(t); assert.equal((await post(url, {})).status, 422); assert.equal((await post(url, input, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await fetch(url + '/v1/check', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rapidapi-proxy-secret': secret }, body: '{' })).status, 400);
});
test('HTTP adapter bounds both declared and chunked bodies', async t => {
  const url = await fixture(t, { maxBodyBytes: 64 }); assert.equal((await post(url, input)).status, 413);
  const status = await new Promise((resolve, reject) => {
    const req = request(url + '/v1/check', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rapidapi-proxy-secret': secret, 'transfer-encoding': 'chunked' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('x'.repeat(65)); req.end();
  }); assert.equal(status, 413);
});
