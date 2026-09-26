import Ajv from 'ajv';
import { parse } from 'csv-parse/sync';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
const encoder = new TextEncoder();
const byteLength = value => encoder.encode(value).length;

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
const shorten = (value, limit) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const pointerPart = value => value.replace(/~/g, '~0').replace(/\//g, '~1');
function errorPath(error) {
  let path = error.instancePath || '';
  const property = error.params.missingProperty ?? error.params.additionalProperty;
  if (property !== undefined) path += `/${pointerPart(property)}`;
  return shorten(path || '/', 256);
}
function validationMessage(error) {
  const path = errorPath(error);
  switch (error.keyword) {
    case 'required': return `Add the required field at ${path}.`;
    case 'additionalProperties': return `Remove the unsupported field at ${path}.`;
    case 'type': return `Expected ${error.params.type} at ${path}.`;
    case 'minimum': case 'maximum':
      return `The value at ${path} must be ${error.keyword === 'minimum' ? 'at least' : 'at most'} ${error.params.limit}.`;
    case 'minItems': case 'maxItems':
      return `${path} must contain ${error.keyword === 'minItems' ? 'at least' : 'at most'} ${error.params.limit} items.`;
    case 'minLength': case 'maxLength':
      return `${path} must contain ${error.keyword === 'minLength' ? 'at least' : 'at most'} ${error.params.limit} characters.`;
    case 'enum': return `Use a value allowed by the schema at ${path}.`;
    case 'uniqueItems': return `Remove duplicate items from ${path}.`;
    default: return `Correct the ${error.keyword} rule at ${path}.`;
  }
}
function jsonParseDetails(error, content) {
  const details = { errorCode: 'INVALID_JSON' };
  // Read only location suffixes; V8's error message may quote file content.
  const location = /\(line (\d+) column (\d+)\)$/.exec(error.message);
  if (location) {
    details.line = Number(location[1]);
    details.column = Number(location[2]);
  } else {
    const position = / at position (\d+)$/.exec(error.message);
    if (position && Number(position[1]) <= content.length) {
      const prefix = content.slice(0, Number(position[1]));
      details.line = prefix.split('\n').length;
      details.column = prefix.length - prefix.lastIndexOf('\n');
    }
  }
  return details;
}
function csvParseDiagnostic(error) {
  const reasons = {
    CSV_RECORD_INCONSISTENT_FIELDS_LENGTH: 'Give every record the same number of columns as the header',
    CSV_QUOTE_NOT_CLOSED: 'Close the quoted CSV field',
    INVALID_OPENING_QUOTE: 'Quote the whole CSV field and escape embedded quotes by doubling them',
    CSV_INVALID_CLOSING_QUOTE: 'Escape embedded quotes by doubling them or close the CSV field before the delimiter',
    CSV_MAX_RECORD_SIZE: 'Shorten this CSV record to fit the parser record-size limit',
  };
  const errorCode = Object.hasOwn(reasons, error.code) ? error.code : 'CSV_PARSE_ERROR';
  const details = { errorCode };
  if (Number.isSafeInteger(error.lines) && error.lines > 0) details.line = error.lines;
  const location = details.line ? ` at line ${details.line}` : '';
  return { message: `${reasons[errorCode] ?? 'Correct the CSV syntax'}${location}.`, details };
}
function headerDetails(expected, actual) {
  const preview = headers => headers.slice(0, 20).map(header => shorten(header, 120));
  return {
    expectedHeaders: preview(expected), actualHeaders: preview(actual),
    expectedHeaderCount: expected.length, actualHeaderCount: actual.length,
    headersTruncated: [expected, actual].some(headers => headers.length > 20 || headers.some(header => header.length > 120)),
  };
}
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
    if (!depth(input) || byteLength(JSON.stringify(input) ?? '') > LIMITS.inputBytes) return invalid('INPUT_LIMIT', 'Input exceeds size or nesting limit.');
  } catch { return invalid('INPUT_LIMIT', 'Input must be a finite JSON document.'); }
  if (!validateInput(input)) return invalid('INPUT_SHAPE', validationMessage(validateInput.errors[0]));
  const names = values => values.map(v => v.name);
  if (new Set(names(input.requirements)).size !== input.requirements.length || new Set(names(input.files)).size !== input.files.length) return invalid('DUPLICATE_NAME', 'Each filename must be unique within its list.');
  const bytes = input.files.reduce((sum, f) => sum + byteLength(f.content), 0);
  if (bytes > LIMITS.totalBytes || input.files.some(f => byteLength(f.content) > LIMITS.fileBytes)) return invalid('INPUT_LIMIT', 'Decoded file content exceeds the bundle or file limit.');
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
    const add = (code, passed, message, details) => result.checks.push({ code, passed,
      ...(!passed && message ? { message } : {}), ...(!passed && details ? { details } : {}) });
    add('PRESENT', supplied.has(r.name), `Add the required file named "${r.name}".`, { fileName: r.name });
    if (!supplied.has(r.name)) return { ...result, status: 'FAIL' };
    const content = supplied.get(r.name), data = encoder.encode(content);
    result.bytes = data.length;
    result.sha256 = bytesToHex(sha256(data));
    add('UTF8_TEXT', !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(content),
      'Replace unpaired Unicode surrogates and provide valid UTF-8 text.');
    add('MAX_BYTES', data.length <= r.maxBytes, `File contains ${data.length} UTF-8 bytes; the limit is ${r.maxBytes}.`,
      { actualBytes: data.length, maxBytes: r.maxBytes });
    if (r.sha256) add('SHA256_MATCH', result.sha256 === r.sha256.toLowerCase(),
      'The SHA-256 digest differs from the requirement. Check the file version and preserve its original bytes.');
    if (r.kind === 'json') {
      let parsed;
      try {
        parsed = JSON.parse(content);
        const withinDepth = depth(parsed);
        add('JSON_PARSE', withinDepth, 'Reduce JSON nesting to at most 48 levels.', { errorCode: 'JSON_DEPTH_LIMIT' });
      } catch (error) {
        const details = jsonParseDetails(error, content);
        const location = details.line ? ` at line ${details.line}, column ${details.column}` : '';
        add('JSON_PARSE', false, `Correct the JSON syntax${location}.`, details);
      }
      if (result.checks.at(-1).passed && compiled.has(r.name)) {
        const validator = compiled.get(r.name);
        const passed = validator(parsed);
        const error = validator.errors?.[0];
        add('JSON_SCHEMA', passed, error && validationMessage(error), error && { path: errorPath(error), keyword: error.keyword });
        if (validator.errors) result.schemaError = { path: validator.errors[0].instancePath || '/', keyword: validator.errors[0].keyword, message: validator.errors[0].message };
      }
    }
    if (r.kind === 'csv') {
      try {
        const rows = parse(content, { bom: true, skip_empty_lines: true, max_record_size: 65536, relax_column_count: false });
        add('CSV_PARSE', true);
        const headers = rows.shift() ?? [];
        add('CSV_HEADERS', JSON.stringify(headers) === JSON.stringify(r.csv.headers),
          'Match the CSV header names and order to the requirement.', headerDetails(r.csv.headers, headers));
        result.rows = rows.length;
        if (r.csv.minRows !== undefined) add('MIN_ROWS', rows.length >= r.csv.minRows,
          `Found ${rows.length} data rows; at least ${r.csv.minRows} are required.`, { actualRows: rows.length, minRows: r.csv.minRows });
        if (r.csv.maxRows !== undefined) add('MAX_ROWS', rows.length <= r.csv.maxRows,
          `Found ${rows.length} data rows; at most ${r.csv.maxRows} are allowed.`, { actualRows: rows.length, maxRows: r.csv.maxRows });
      } catch (error) {
        const { message, details } = csvParseDiagnostic(error);
        add('CSV_PARSE', false, message, details);
      }
    }
    return { ...result, status: result.checks.every(c => c.passed) ? 'PASS' : 'FAIL' };
  });
  return { version: '0.1.0', status: !issues.length && files.every(f => f.status === 'PASS') ? 'PASS' : 'FAIL', totalBytes: bytes, issues, files, notChecked: excluded };
}
