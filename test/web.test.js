import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkBundle, LIMITS } from '../src/check.js';
import { decodeFile, makeBundle } from '../web/input.js';

const fields = (overrides={}) => ({filename:'test.csv',kind:'csv',content:'sku,name\n1,Pen\n',headers:'sku\nname','min-rows':'1','max-rows':'','max-bytes':'1048576',hash:'',schema:'',...overrides});
test('file decoding preserves BOM, CRLF and non-ASCII bytes for a real fingerprint', async () => {
  const data = Buffer.from('\ufeffsku,name\r\n1,钢笔😀\r\n');
  const content = await decodeFile(new File([data],'test.csv'));
  const result = checkBundle(makeBundle(fields({content})));
  assert.equal(result.status,'PASS');
  assert.equal(result.files[0].bytes,data.length);
  assert.equal(result.files[0].sha256,createHash('sha256').update(data).digest('hex'));
});
test('non UTF-8 and oversize uploads are rejected before checking',async () => {
  await assert.rejects(decodeFile(new File([new Uint8Array([0xc3,0x28])],'bad.txt')),/UTF-8/);
  await assert.rejects(decodeFile({size:LIMITS.fileBytes+1,arrayBuffer(){throw new Error('must not read');}}),/1 MiB/);
});
test('form rules enforce row ranges and explicit CSV contracts', () => {
  assert.equal(checkBundle(makeBundle(fields())).status,'PASS');
  for (const overrides of [{headers:''},{headers:'sku\n\nname'},{headers:'sku\nsku'},{'min-rows':'1.2'},{'max-rows':'0'},{'max-bytes':''}]) assert.throws(() => makeBundle(fields(overrides)));
  assert.equal(checkBundle(makeBundle(fields({headers:'name\nsku'}))).status,'FAIL');
});
test('boolean false schema fails data; unsupported schema is invalid, never a pass', () => {
  const values = fields({filename:'test.json',kind:'json',content:'{}',schema:'false'});
  assert.equal(checkBundle(makeBundle(values)).status,'FAIL');
  assert.equal(checkBundle(makeBundle({...values,schema:'{"$ref":"https://example.com/schema"}'})).status,'INVALID_SPEC');
  assert.throws(() => makeBundle({...values,schema:'{'}),/not valid JSON/);
});
test('portable SHA-256 matches Node on empty and multi-block Unicode files', () => {
  for(const content of ['', 'a'.repeat(64), 'hello😀中文'.repeat(500)]) {
    const result = checkBundle(makeBundle(fields({filename:'test.txt',kind:'text',content})));
    assert.equal(result.status,'PASS');
    assert.equal(result.files[0].sha256,createHash('sha256').update(content).digest('hex'));
  }
});
