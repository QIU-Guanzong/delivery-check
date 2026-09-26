import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBundle, LIMITS } from '../src/check.js';
const bundle = (rule = {}, content = 'hello') => ({ requirements: [{ name: 'a.txt', kind: 'text', maxBytes: 100, ...rule }], files: [{ name: 'a.txt', content }] });
test('valid text returns known SHA-256, bytes, and excluded claims', () => {
  const r = checkBundle(bundle()); assert.equal(r.status, 'PASS'); assert.equal(r.files[0].bytes, 5);
  assert.equal(r.files[0].sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'); assert.ok(r.notChecked.includes('payment eligibility'));
});
test('missing required evidence fails', () => { const b = bundle(); b.files = []; assert.equal(checkBundle(b).status, 'FAIL'); });
test('extra files fail unless explicitly allowed', () => { const b = bundle(); b.files.push({ name: 'extra.txt', content: '' }); assert.equal(checkBundle(b).status, 'FAIL'); b.allowExtraFiles = true; assert.equal(checkBundle(b).status, 'PASS'); });
test('duplicate supplied names invalidate contract', () => { const b = bundle(); b.files.push(b.files[0]); assert.equal(checkBundle(b).status, 'INVALID_SPEC'); });
test('duplicate requirements invalidate contract', () => { const b = bundle(); b.requirements.push(b.requirements[0]); assert.equal(checkBundle(b).status, 'INVALID_SPEC'); });
test('UTF-8 bytes rather than characters determine limit', () => { assert.equal(checkBundle(bundle({ maxBytes: 5 }, '中文')).status, 'FAIL'); assert.equal(checkBundle(bundle({ maxBytes: 6 }, '中文')).status, 'PASS'); });
test('hash mismatch fails without exposing content', () => { const r = checkBundle(bundle({ sha256: '0'.repeat(64) }, 'private example')); assert.equal(r.status, 'FAIL'); assert.ok(!JSON.stringify(r).includes('private example')); });
test('bad JSON fails', () => { assert.equal(checkBundle(bundle({kind:'json'}, '{')).status, 'FAIL'); });
test('JSON schema rejects wrong type, accepts correct type', () => {
  const rule = {kind:'json', jsonSchema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}};
  assert.equal(checkBundle(bundle(rule,'{"ok":"yes"}')).status,'FAIL'); assert.equal(checkBundle(bundle(rule,'{"ok":true}')).status,'PASS');
});
test('boolean schemas do not silently skip false', () => { assert.equal(checkBundle(bundle({kind:'json',jsonSchema:false}, '{}')).status,'FAIL'); });
test('ordinary field names matching schema keywords are supported', () => { assert.equal(checkBundle(bundle({kind:'json',jsonSchema:{type:'object',properties:{format:{type:'string'},pattern:{type:'string'}}}}, '{"format":"csv","pattern":"x"}')).status,'PASS'); });
test('remote references, regex and unknown schema keywords are refused', () => {
  for (const jsonSchema of [{$ref:'https://example.com/schema'}, {type:'string',pattern:'(a+)+$'}, {type:'object',misspelled:true}, {anyOf:[{type:'string'}]}]) assert.equal(checkBundle(bundle({kind:'json',jsonSchema},'{}')).status,'INVALID_SPEC');
});
test('quoted commas, embedded newline and CRLF CSV work', () => {
  const rule={kind:'csv',csv:{headers:['name','note'],minRows:2,maxRows:2}};
  const r=checkBundle(bundle(rule,'name,note\r\nAlice,"a,b"\r\nBob,"two\nlines"\r\n')); assert.equal(r.status,'PASS'); assert.equal(r.files[0].rows,2);
});
test('CSV header order and row count are enforced', () => {
  const rule={kind:'csv',csv:{headers:['name','id'],minRows:2}};
  assert.equal(checkBundle(bundle(rule,'id,name\n1,Alice')).status,'FAIL'); assert.equal(checkBundle(bundle(rule,'name,id\nAlice,1')).status,'FAIL');
});
test('CSV inconsistent widths and unclosed quotes fail', () => { for(const text of ['a,b\n1,2,3','a,b\n"unclosed']) assert.equal(checkBundle(bundle({kind:'csv',csv:{headers:['a','b']}},text)).status,'FAIL'); });
test('BOM CSV and empty rows have documented behavior', () => { assert.equal(checkBundle(bundle({kind:'csv',csv:{headers:['a'],minRows:1,maxRows:1}}, '\ufeffa\n\nvalue\n')).status,'PASS'); });
test('invalid contract is distinct from failed delivery', () => {
  for(const b of [null,{},bundle({maxBytes:-1}),bundle({kind:'csv'}),bundle({csv:{headers:['a']}}),bundle({kind:'csv',csv:{headers:['a'],minRows:2,maxRows:1}})]) assert.equal(checkBundle(b).status,'INVALID_SPEC');
});
test('path and URL names are rejected', () => { for(const n of ['../secret','a/b.txt','C:\\file.txt','https://example.com']) { const b=bundle(); b.files[0].name=n; assert.equal(checkBundle(b).status,'INVALID_SPEC'); } });
test('file count, size and nesting are bounded', () => {
  const b=bundle(); b.files=Array.from({length:33},(_,i)=>({name:`f${i}`,content:''})); assert.equal(checkBundle(b).status,'INVALID_SPEC');
  assert.equal(checkBundle(bundle({},'x'.repeat(LIMITS.fileBytes+1))).status,'INVALID_SPEC');
  let deep={}; for(let i=0;i<55;i++) deep={nested:deep}; assert.equal(checkBundle(deep).status,'INVALID_SPEC');
});
test('unpaired surrogate cannot pass UTF-8 check; emoji can', () => { assert.equal(checkBundle(bundle({},'\ud800')).status,'FAIL'); assert.equal(checkBundle(bundle({},'😀')).status,'PASS'); });
test('input objects are not modified', () => { const b=bundle({kind:'json',jsonSchema:{type:'object',properties:{n:{type:'integer',default:3}}}},'{}'); const before=JSON.stringify(b); checkBundle(b); assert.equal(JSON.stringify(b),before); });

const check = (report, code) => report.files[0].checks.find(item => item.code === code);

test('invalid configuration identifies the field and expected type without echoing its value', () => {
  const missing = bundle();
  delete missing.requirements[0].maxBytes;
  assert.match(checkBundle(missing).issues[0].message, /Add the required field at \/requirements\/0\/maxBytes/);
  const wrongType = checkBundle(bundle({ maxBytes: 'private value' }));
  assert.equal(wrongType.status, 'INVALID_SPEC');
  assert.match(wrongType.issues[0].message, /Expected integer at \/requirements\/0\/maxBytes/);
  assert.ok(!JSON.stringify(wrongType).includes('private value'));
});

test('missing files and byte limits provide a concrete repair target', () => {
  const missing = bundle(); missing.files = [];
  assert.deepEqual(check(checkBundle(missing), 'PRESENT'), {
    code: 'PRESENT', passed: false, message: 'Add the required file named "a.txt".', details: { fileName: 'a.txt' },
  });
  const oversized = check(checkBundle(bundle({ maxBytes: 5 }, '中文')), 'MAX_BYTES');
  assert.deepEqual(oversized.details, { actualBytes: 6, maxBytes: 5 });
  assert.match(oversized.message, /6 UTF-8 bytes; the limit is 5/);
});

test('successful checks retain the original code and passed shape', () => {
  for (const input of [bundle(), bundle({ kind: 'json', jsonSchema: { type: 'object' } }, '{}'),
    bundle({ kind: 'csv', csv: { headers: ['id'], minRows: 1, maxRows: 1 } }, 'id\n1')]) {
    const report = checkBundle(input);
    assert.equal(report.status, 'PASS');
    assert.ok(report.files[0].checks.every(item => Object.keys(item).join(',') === 'code,passed'));
  }
});

test('JSON syntax diagnostics locate the error without quoting content', () => {
  const report = checkBundle(bundle({ kind: 'json' }, '{\n"secret": "private-value"\n"ok": true}'));
  const failure = check(report, 'JSON_PARSE');
  assert.deepEqual(failure.details, { errorCode: 'INVALID_JSON', line: 3, column: 1 });
  assert.match(failure.message, /line 3, column 1/);
  assert.ok(!JSON.stringify(report).includes('private-value'));
  // V8 can quote most of a short malformed document in its error text.
  const short = checkBundle(bundle({ kind: 'json' }, 'private-value'));
  assert.equal(check(short, 'JSON_PARSE').details.errorCode, 'INVALID_JSON');
  assert.ok(!JSON.stringify(short).includes('private-value'));
});

test('JSON nesting failures are distinct from syntax failures', () => {
  const content = '['.repeat(50) + '0' + ']'.repeat(50);
  const failure = check(checkBundle(bundle({ kind: 'json', maxBytes: 200 }, content)), 'JSON_PARSE');
  assert.deepEqual(failure.details, { errorCode: 'JSON_DEPTH_LIMIT' });
  assert.match(failure.message, /48 levels/);
});

test('JSON schema diagnostics locate missing and incorrectly typed properties', () => {
  const rule = { kind: 'json', jsonSchema: { type: 'object', properties: { 'a/b~c': { type: 'boolean' } }, required: ['a/b~c'] } };
  const missing = checkBundle(bundle(rule, '{}'));
  assert.deepEqual(check(missing, 'JSON_SCHEMA').details, { path: '/a~1b~0c', keyword: 'required' });
  assert.match(check(missing, 'JSON_SCHEMA').message, /Add the required field/);
  assert.equal(missing.files[0].schemaError.path, '/', 'existing schemaError shape is retained');
  const wrongType = checkBundle(bundle(rule, '{"a/b~c":"private-value"}'));
  assert.deepEqual(check(wrongType, 'JSON_SCHEMA').details, { path: '/a~1b~0c', keyword: 'type' });
  assert.match(check(wrongType, 'JSON_SCHEMA').message, /Expected boolean/);
  assert.ok(!JSON.stringify(wrongType).includes('private-value'));
});

test('JSON schema diagnostic paths are bounded', () => {
  const key = 'x'.repeat(600);
  const report = checkBundle(bundle({ kind: 'json', jsonSchema: { type: 'object', properties: { [key]: { type: 'boolean' } } }, maxBytes: 1000 }, JSON.stringify({ [key]: 1 })));
  const failure = check(report, 'JSON_SCHEMA');
  assert.equal(failure.details.path.length, 256);
  assert.ok(failure.details.path.endsWith('…'));
  assert.ok(failure.message.length < 400);
});

test('CSV header and row failures show the contract and observed values without content rows', () => {
  const rule = { kind: 'csv', csv: { headers: ['id', 'name'], minRows: 2 } };
  const report = checkBundle(bundle(rule, 'name,id\nprivate-value,1\n'));
  assert.deepEqual(check(report, 'CSV_HEADERS').details, {
    expectedHeaders: ['id', 'name'], actualHeaders: ['name', 'id'],
    expectedHeaderCount: 2, actualHeaderCount: 2, headersTruncated: false,
  });
  assert.deepEqual(check(report, 'MIN_ROWS').details, { actualRows: 1, minRows: 2 });
  assert.ok(!JSON.stringify(report).includes('private-value'));
  const tooMany = checkBundle(bundle({ kind: 'csv', csv: { headers: ['id'], maxRows: 0 } }, 'id\n1\n'));
  assert.deepEqual(check(tooMany, 'MAX_ROWS').details, { actualRows: 1, maxRows: 0 });
});

test('CSV header previews cap both the number and length of header names', () => {
  const headers = Array.from({ length: 25 }, (_, index) => `${index}${'x'.repeat(180)}`);
  const report = checkBundle(bundle({ kind: 'csv', csv: { headers }, maxBytes: 10000 }, [...headers].reverse().join(',')));
  const details = check(report, 'CSV_HEADERS').details;
  assert.equal(details.expectedHeaderCount, 25);
  assert.equal(details.actualHeaderCount, 25);
  assert.equal(details.expectedHeaders.length, 20);
  assert.equal(details.actualHeaders.length, 20);
  assert.ok([...details.expectedHeaders, ...details.actualHeaders].every(header => header.length <= 120));
  assert.equal(details.headersTruncated, true);
});

test('CSV parse diagnostics use stable codes and line numbers without record content', () => {
  for (const [content, errorCode] of [
    ['a,b\nprivate-value,1,2', 'CSV_RECORD_INCONSISTENT_FIELDS_LENGTH'],
    ['a,b\n"private-value,1', 'CSV_QUOTE_NOT_CLOSED'],
    ['a,b\nprivate"-value,1', 'INVALID_OPENING_QUOTE'],
  ]) {
    const report = checkBundle(bundle({ kind: 'csv', csv: { headers: ['a', 'b'] } }, content));
    const failure = check(report, 'CSV_PARSE');
    assert.deepEqual(failure.details, { errorCode, line: 2 });
    assert.match(failure.message, /line 2/);
    assert.ok(!JSON.stringify(report).includes('private'));
  }
});

test('hash failure guidance does not repeat expected or actual digests', () => {
  const report = checkBundle(bundle({ sha256: '0'.repeat(64) }));
  const failure = check(report, 'SHA256_MATCH');
  assert.match(failure.message, /file version/);
  assert.ok(!failure.message.includes('0'.repeat(64)));
  assert.ok(!failure.message.includes(report.files[0].sha256));
  assert.equal(failure.details, undefined);
});
