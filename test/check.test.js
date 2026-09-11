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
