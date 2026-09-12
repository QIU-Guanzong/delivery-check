import { checkBundle, LIMITS } from '../src/check.js';
import { decodeFile, makeBundle } from './input.js';

const $ = id => document.getElementById(id);
let report = null;
let fileGeneration = 0;
let originalContent = null;
let invalidFile = false;
const fields = ['filename','kind','content','headers','min-rows','max-rows','schema','max-bytes','hash'];
const labels = {
  PRESENT: ['File provided', 'Required file is missing.'],
  UTF8_TEXT: ['Valid UTF-8 text', 'Contains invalid Unicode characters.'],
  MAX_BYTES: ['Within your size limit', 'File exceeds your chosen size limit.'],
  SHA256_MATCH: ['Fingerprint matches', 'Fingerprint differs from the expected file.'],
  JSON_PARSE: ['Valid JSON syntax', 'JSON syntax is invalid or nesting is too deep.'],
  JSON_SCHEMA: ['Matches JSON Schema', 'JSON does not match your schema.'],
  CSV_PARSE: ['Consistent CSV structure', 'Check quoting and row widths; each record is limited to 65,536 characters.'],
  CSV_HEADERS: ['Columns match, in order', 'Column names or their order differ from your expected list.'],
  MIN_ROWS: ['Minimum row count met', 'Fewer data rows than required.'],
  MAX_ROWS: ['Within maximum row count', 'More data rows than allowed.'],
};
function clearReport() {
  report = null; $('result').hidden = true; $('empty').hidden = false;
  $('report-json').textContent = ''; $('checks').replaceChildren(); $('file-summary').replaceChildren();
  $('error').hidden = true;
}
function update() {
  clearReport();
  $('csv-rules').hidden = $('kind').value !== 'csv';
  $('json-rules').hidden = $('kind').value !== 'json';
  $('size').textContent = `${new TextEncoder().encode(originalContent ?? $('content').value).length.toLocaleString()} bytes · UTF-8`;
  $('run').disabled = invalidFile;
}
function error(message) { clearReport(); $('error').textContent = message; $('error').hidden = false; }
function reset() {
  fileGeneration++;
  originalContent = null; invalidFile = false;
  fields.forEach(id => $(id).value = '');
  $('filename').value = 'delivery.csv'; $('kind').value = 'csv'; $('max-bytes').value = LIMITS.fileBytes;
  $('file').value = ''; $('run').disabled = false; update();
}
fields.forEach(id => $(id).addEventListener('input', () => {
  if (id === 'content') {fileGeneration++; originalContent = null; invalidFile = false;}
  const message = invalidFile ? $('error').textContent : '';
  update();
  if (message) { $('error').textContent = message; $('error').hidden = false; }
}));
$('reset').addEventListener('click', reset);
$('file').addEventListener('change', async () => {
  const file = $('file').files[0]; if (!file) return;
  const generation = ++fileGeneration; clearReport(); originalContent = null; invalidFile = true;
  // Discard the previous file before decoding, so a rejected file cannot be mistaken for it.
  $('content').value = ''; $('filename').value = file.name; update();
  try {
    const content = await decodeFile(file);
    if (generation !== fileGeneration) return;
    originalContent = content; invalidFile = false;
    $('content').value = content;
    $('kind').value = /\.csv$/i.test(file.name) ? 'csv' : /\.json$/i.test(file.name) ? 'json' : 'text';
    $('hash').value = ''; update();
  } catch (e) { if (generation === fileGeneration) error(e.message); }
  finally { if (generation === fileGeneration) $('run').disabled = invalidFile; }
});
function sample(kind) {
  reset(); $('kind').value = kind; $('filename').value = `delivery.${kind}`;
  if (kind === 'csv') {
    $('content').value = 'sku,name,price\nBOOK-01,Field Notes,12.50\nPEN-02,Black Pen,3.00\n';
    $('headers').value = 'sku\nname\nprice'; $('min-rows').value = '2';
  } else {
    $('content').value = '{\n  "id": "order-1042",\n  "ready": true\n}';
    $('schema').value = JSON.stringify({type:'object',required:['id','ready'],properties:{id:{type:'string'},ready:{type:'boolean'}},additionalProperties:false},null,2);
  }
  update();
}
$('csv-example').addEventListener('click', () => sample('csv'));
$('json-example').addEventListener('click', () => sample('json'));
$('run').addEventListener('click', () => {
  clearReport();
  try {
    const values = Object.fromEntries(fields.map(id => [id,$(id).value]));
    values.content = originalContent ?? values.content;
    report = checkBundle(makeBundle(values));
    $('empty').hidden = true; $('result').hidden = false;
    const pass = report.status === 'PASS', invalid = report.status === 'INVALID_SPEC';
    $('result-banner').className = pass ? '' : invalid ? 'invalid' : 'fail';
    $('result-status').textContent = report.status;
    $('result-headline').textContent = pass ? 'Your checks passed.' : invalid ? 'Adjust the rules first.' : 'A few things to fix.';
    $('result-description').textContent = pass ? 'This file meets the rules you selected. Review its contents before sending.' : invalid ? 'The checking rules could not be applied. Your file has not passed validation.' : 'See the items below, update the file or its expected rules, then check again.';
    const f = report.files[0];
    if (f) for (const [key, value] of [['File',f.name],['Size',`${f.bytes.toLocaleString()} bytes`],...(f.rows === undefined ? [] : [['Data rows',f.rows]])]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; $('file-summary').append(dt,dd);
    }
    for (const item of [...(f?.checks ?? []), ...report.issues.map(i => ({code:i.code,passed:false,message:i.message}))]) {
      const li = document.createElement('li'), icon = document.createElement('b'), text = document.createElement('span');
      li.className = item.passed ? '' : 'failed'; icon.textContent = item.passed ? '✓' : '×';
      text.textContent = item.message ?? labels[item.code]?.[item.passed ? 0 : 1] ?? item.code;
      if (item.code === 'JSON_SCHEMA' && !item.passed && f.schemaError) text.textContent += ` At ${f.schemaError.path}: ${f.schemaError.message}.`;
      li.append(icon,text); $('checks').append(li);
    }
    $('report-json').textContent = JSON.stringify(report,null,2);
  } catch(e) { error(e.message); }
});
$('download').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'delivery-check-report.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
update();
