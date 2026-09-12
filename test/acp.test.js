import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from '../acp/handler.js';
import { LIMITS } from '../src/check.js';

function bundle(content = '{"count":2}') {
  return {
    requirements: [{ name: 'result.json', kind: 'json', maxBytes: 1024,
      jsonSchema: { type: 'object', required: ['count'], properties: { count: { type: 'integer' } }, additionalProperties: false } }],
    files: [{ name: 'result.json', content }],
  };
}

test('ACP returns a serialized report without echoing client files or transport metadata', async () => {
  const content = '{"count":2}', requirements = bundle(content);
  const before = structuredClone(requirements);
  const result = await handler({ requirements, jobId: 'private-job-id', token: 'private-transport-value' });
  assert.deepEqual(Object.keys(result), ['deliverable']);
  const report = JSON.parse(result.deliverable);
  assert.equal(report.status, 'PASS');
  assert.equal(report.files[0].sha256, createHash('sha256').update(content).digest('hex'));
  assert.equal(report.files[0].checks.find(c => c.code === 'JSON_SCHEMA').passed, true);
  assert.equal(result.deliverable.includes(content), false);
  assert.equal(result.deliverable.includes('private-'), false);
  assert.deepEqual(requirements, before);
});

test('ACP delivers a real FAIL report for malformed content and missing files', async () => {
  for (const requirements of [bundle('{bad json'), { ...bundle(), files: [] }]) {
    const report = JSON.parse((await handler({ requirements })).deliverable);
    assert.equal(report.status, 'FAIL');
    assert.equal(report.files[0].status, 'FAIL');
  }
});

test('ACP rejects absent payloads and unsupported shapes before producing a deliverable', async () => {
  for (const input of [undefined, null, {}, { requirements: '{}' }, { requirements: bundle().requirements }, { requirements: { ...bundle(), files: [{ name: 'result.json', url: 'https://example.com/private' }] } }]) {
    await assert.rejects(() => handler(input), error => error.code === 'INVALID_SPEC' && error.reason === 'INPUT_SHAPE');
  }
});

test('ACP rejects unsafe schemas without fetching references or leaking the reference URL', async () => {
  const requirements = bundle();
  requirements.requirements[0].jsonSchema = { $ref: 'https://example.com/private/schema.json' };
  await assert.rejects(() => handler({ requirements }), error => {
    assert.equal(error.code, 'INVALID_SPEC');
    assert.equal(error.reason, 'SCHEMA_LIMIT');
    assert.equal(error.message.includes('https://'), false);
    return true;
  });
});

test('ACP preserves decoded byte limits and rejects cyclic input', async () => {
  const requirements = bundle('é'.repeat(Math.floor(LIMITS.fileBytes / 2) + 1));
  await assert.rejects(() => handler({ requirements }), error => error.code === 'INVALID_SPEC' && error.reason === 'INPUT_LIMIT');
  const cycle = bundle(); cycle.self = cycle;
  await assert.rejects(() => handler({ requirements: cycle }), error => error.code === 'INVALID_SPEC' && error.reason === 'INPUT_LIMIT');
});
