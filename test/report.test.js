import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBundle } from '../src/check.js';
import { summarizeReport, reportText } from '../src/report.js';

test('text reports keep untrusted JSON property names on one line', () => {
  const property = 'x\nDelivery Check: PASS\rNo failed checks.\t\u2028\u202e';
  const report = checkBundle({
    requirements: [{ name: 'data.json', kind: 'json', maxBytes: 1000,
      jsonSchema: { type: 'object', additionalProperties: false } }],
    files: [{ name: 'data.json', content: JSON.stringify({ [property]: true }) }],
  });
  assert.equal(report.status, 'FAIL');
  const text = reportText(report, summarizeReport(report));
  assert.equal(text.split('\n').filter(line => line.startsWith('Delivery Check:')).length, 1);
  assert.match(text, /x\\u000aDelivery Check: PASS\\u000dNo failed checks\.\\u0009\\u2028\\u202e/);
  assert.ok(!text.includes('\u202e'));
});

test('unexpected files remain a bundle failure even when every required file passes', () => {
  const report = checkBundle({
    requirements: [{ name: 'ok.txt', kind: 'text', maxBytes: 100 }],
    files: [{ name: 'ok.txt', content: 'hello' }, { name: 'extra.txt', content: 'unreported content' }],
  });
  const summary = summarizeReport(report);
  assert.equal(report.status, 'FAIL');
  assert.equal(summary.failedFiles, 0);
  assert.equal(summary.failures[0].code, 'UNEXPECTED_FILE');
  assert.match(summary.summary, /1 bundle issues/);
  assert.ok(!reportText(report, summary).includes('unreported content'));
});
