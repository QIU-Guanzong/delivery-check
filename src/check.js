import Ajv from 'ajv';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ files: 32, fileBytes: 1_048_576, totalBytes: 4_194_304, inputBytes: 6_291_456 });
const name = { type: 'string', minLength: 1, maxLength: 180, pattern: '^[A-Za-z0-9][A-Za-z0-9_. -]*$' };
const count = { type: 'integer', minimum: 0, maximum: 100000 };
const schema = {
  type: 'object', additionalProperties: false, required: ['requirements', 'files'], properties: {
    allowExtraFiles: { type: 'boolean' },
    requirements: { type: 'array', minItems: 1, maxItems: LIMITS.files, items: {
      type: 'object', additionalProperties: false, required: ['name', 'kind', 'maxBytes'], properties: {
        name, kind: { enum: ['text', 'json', 'csv'] }, maxBytes: { type: 'integer', minimum: 1, maximum: LIMITS.fileBytes },
        sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
        jsonSchema: { anyOf: [{ type: 'object' }, { type: 'boolean' }] },
        csv: { type: 'object', additionalProperties: false, required: ['headers'], properties: {
          headers: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 200 } },
          minRows: count, maxRows: count,
        } },
      },
    } },
    files: { type: 'array', maxItems: LIMITS.files, items: {
      type: 'object', additionalProperties: false, required: ['name', 'content'], properties: { name, content: { type: 'string', maxLength: LIMITS.fileBytes } },
    } },
  },
};
const validateInput = new Ajv({ strict: true, allErrors: false }).compile(schema);
const excluded = ['content truthfulness', 'subjective acceptance', 'malware analysis', 'HTML rendering/accessibility', 'payment eligibility'];
function invalid(code, message) { return { version: '0.1.0', status: 'INVALID_SPEC', issues: [{ code, message }], files: [], notChecked: excluded }; }
function depth(value, level = 0) {
  if (level > 48) return false;
  return value === null || typeof value !== 'object' || Object.values(value).every(x => depth(x, level + 1));
}
function safeSchema(value) {
  if (!depth(value) || JSON.stringify(value).length > 16000) return false;
  // Keep untrusted schemas bounded; property names and enum data are not keywords.
  const forbidden = new Set(['$ref', '$dynamicRef', '$recursiveRef', 'pattern', 'patternProperties', 'format', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependencies', 'uniqueItems']);
  function walk(v, level = 0) {
    if (level > 12) return false;
    if (typeof v === 'boolean') return true;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    for (const [k, x] of Object.entries(v)) {
      if (forbidden.has(k)) return false;
      if (['properties', 'definitions', '$defs'].includes(k) && (!x || typeof x !== 'object' || !Object.values(x).every(s => walk(s, level + 1)))) return false;
      if (['additionalProperties', 'additionalItems', 'contains', 'propertyNames'].includes(k) && !walk(x, level + 1)) return false;
      if (k === 'items' && !(Array.isArray(x) ? x.every(s => walk(s, level + 1)) : walk(x, level + 1))) return false;
    }
    return true;
  }
  return walk(value);
}

export function checkBundle(input) {
  try {
    if (!depth(input) || Buffer.byteLength(JSON.stringify(input) ?? '') > LIMITS.inputBytes) return invalid('INPUT_LIMIT', 'Input exceeds size or nesting limit.');
  } catch { return invalid('INPUT_LIMIT', 'Input must be a finite JSON document.'); }
  if (!validateInput(input)) return invalid('INPUT_SHAPE', `Invalid configuration at ${validateInput.errors[0].instancePath || '/'}.`);
  const names = values => values.map(v => v.name);
  if (new Set(names(input.requirements)).size !== input.requirements.length || new Set(names(input.files)).size !== input.files.length) return invalid('DUPLICATE_NAME', 'Each filename must be unique within its list.');
  const bytes = input.files.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0);
  if (bytes > LIMITS.totalBytes || input.files.some(f => Buffer.byteLength(f.content) > LIMITS.fileBytes)) return invalid('INPUT_LIMIT', 'Decoded file content exceeds the bundle or file limit.');
  const compiled = new Map();
  for (const r of input.requirements) {
    if ((r.jsonSchema !== undefined && r.kind !== 'json') || (r.csv !== undefined && r.kind !== 'csv')) return invalid('RULE_KIND', 'A JSON or CSV rule is attached to a different file kind.');
    if (r.kind === 'csv' && !r.csv) return invalid('CSV_RULE', 'CSV files require an explicit header contract.');
    if (r.csv && r.csv.minRows !== undefined && r.csv.maxRows !== undefined && r.csv.minRows > r.csv.maxRows) return invalid('ROW_RANGE', 'Minimum rows exceeds maximum rows.');
    if (r.jsonSchema !== undefined) {
      if (!safeSchema(r.jsonSchema)) return invalid('SCHEMA_LIMIT', 'Schema exceeds the documented size, depth, or keyword limits.');
      try { compiled.set(r.name, new Ajv({ strict: true, allErrors: false, ownProperties: true }).compile(r.jsonSchema)); }
      catch { return invalid('JSON_SCHEMA', 'JSON schema is invalid or uses an unsupported keyword.'); }
    }
  }
  const supplied = new Map(input.files.map(f => [f.name, f.content]));
  const issues = [];
  const expected = new Set(names(input.requirements));
  if (!input.allowExtraFiles) for (const f of input.files) if (!expected.has(f.name)) issues.push({ name: f.name, code: 'UNEXPECTED_FILE' });
  const files = input.requirements.map(r => {
    const result = { name: r.name, kind: r.kind, checks: [] };
    const add = (code, passed) => result.checks.push({ code, passed });
    add('PRESENT', supplied.has(r.name));
    if (!supplied.has(r.name)) return { ...result, status: 'FAIL' };
    const content = supplied.get(r.name), data = Buffer.from(content, 'utf8');
    result.bytes = data.length;
    result.sha256 = createHash('sha256').update(data).digest('hex');
    add('UTF8_TEXT', !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(content));
    add('MAX_BYTES', data.length <= r.maxBytes);
    if (r.sha256) add('SHA256_MATCH', result.sha256 === r.sha256.toLowerCase());
    if (r.kind === 'json') {
      let parsed;
      try {
        parsed = JSON.parse(content);
        if (!depth(parsed)) throw new Error('depth');
        add('JSON_PARSE', true);
      } catch { add('JSON_PARSE', false); }
      if (result.checks.at(-1).passed && compiled.has(r.name)) {
        const validator = compiled.get(r.name);
        add('JSON_SCHEMA', validator(parsed));
        if (validator.errors) result.schemaError = { path: validator.errors[0].instancePath || '/', keyword: validator.errors[0].keyword, message: validator.errors[0].message };
      }
    }
    if (r.kind === 'csv') {
      try {
        const rows = parse(content, { bom: true, skip_empty_lines: true, max_record_size: 65536, relax_column_count: false });
        add('CSV_PARSE', true);
        const headers = rows.shift() ?? [];
        add('CSV_HEADERS', JSON.stringify(headers) === JSON.stringify(r.csv.headers));
        result.rows = rows.length;
        if (r.csv.minRows !== undefined) add('MIN_ROWS', rows.length >= r.csv.minRows);
        if (r.csv.maxRows !== undefined) add('MAX_ROWS', rows.length <= r.csv.maxRows);
      } catch { add('CSV_PARSE', false); }
    }
    return { ...result, status: result.checks.every(c => c.passed) ? 'PASS' : 'FAIL' };
  });
  return { version: '0.1.0', status: !issues.length && files.every(f => f.status === 'PASS') ? 'PASS' : 'FAIL', totalBytes: bytes, issues, files, notChecked: excluded };
}
