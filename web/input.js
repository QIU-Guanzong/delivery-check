import { LIMITS } from '../src/check.js';

export async function decodeFile(file) {
  if (file.size > LIMITS.fileBytes) throw new Error('Choose a file no larger than 1 MiB.');
  const bytes = await file.arrayBuffer();
  // Keep the BOM so size/hash refer to the actual selected bytes. Never silently replace invalid bytes.
  try { return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); }
  catch { throw new Error('This file is not valid UTF-8 text. Export it as UTF-8 and try again.'); }
}
export function makeBundle(v) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_. -]{0,179}$/.test(v.filename)) throw new Error('Use a file name starting with a letter or number, with only English letters, numbers, spaces, dots, hyphens or underscores.');
  const integer = (raw,min,max,label) => {
    if (!/^\d+$/.test(raw) || +raw < min || +raw > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
    return +raw;
  };
  const rule = {name:v.filename,kind:v.kind,maxBytes:integer(v['max-bytes'],1,LIMITS.fileBytes,'Size limit')};
  if (v.hash.trim()) {
    if (!/^[a-f\d]{64}$/i.test(v.hash.trim())) throw new Error('The expected SHA-256 must contain exactly 64 hexadecimal characters.');
    rule.sha256 = v.hash.trim();
  }
  if (v.kind === 'csv') {
    if (!v.headers) throw new Error('Enter the expected CSV column names, one per line.');
    rule.csv = {headers:v.headers.replace(/\r\n/g,'\n').split('\n')};
    if (rule.csv.headers.some(h => !h) || new Set(rule.csv.headers).size !== rule.csv.headers.length) throw new Error('Column names must be non-empty and unique. Remove any extra blank lines.');
    for (const [id,key] of [['min-rows','minRows'],['max-rows','maxRows']]) if (v[id] !== '') rule.csv[key] = integer(v[id],0,100000,'Row limit');
    if (rule.csv.minRows > rule.csv.maxRows) throw new Error('The minimum row count cannot exceed the maximum.');
  }
  if (v.kind === 'json' && v.schema.trim()) {
    if (v.schema.length > 16000) throw new Error('Keep the schema within 16,000 characters.');
    try { rule.jsonSchema = JSON.parse(v.schema); } catch { throw new Error('Your JSON Schema is not valid JSON.'); }
  }
  return {requirements:[rule],files:[{name:v.filename,content:v.content}]};
}
