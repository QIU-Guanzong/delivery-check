import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { checkBundle } from '../src/check.js';

const run = promisify(execFile);
const entry = fileURLToPath(new URL('../src/actor.js', import.meta.url));
const definition = JSON.parse(await readFile(new URL('../.actor/actor.json', import.meta.url), 'utf8'));
const datasetSchema = JSON.parse(await readFile(new URL('../.actor/dataset_schema.json', import.meta.url), 'utf8'));
const inputSchema = JSON.parse(await readFile(new URL('../.actor/input_schema.json', import.meta.url), 'utf8'));
assert.equal(definition.storages.dataset, './dataset_schema.json');
assert.ok(datasetSchema.views.overview, 'task publishing needs a dataset view');
const validateDatasetRow = new Ajv2020({ allErrors: true, strict: false }).compile(datasetSchema.fields);
const valid = { requirements: [{ name: 'a.txt', kind: 'text', maxBytes: 100 }],
  files: [{ name: 'a.txt', content: 'hello' }] };
const passExample = JSON.parse(await readFile(new URL('../examples/pass.json', import.meta.url), 'utf8'));
const failExample = JSON.parse(await readFile(new URL('../examples/fail.json', import.meta.url), 'utf8'));
const storePrefill = {
  requirements: inputSchema.properties.requirements.prefill,
  files: inputSchema.properties.files.prefill,
};
assert.deepEqual(storePrefill, passExample, 'the Store prefill matches the tested mixed-format example');
const withUnexpectedFile = { ...valid, files: [...valid.files, { name: 'extra.txt', content: 'synthetic' }] };

const taskDrafts = [];
for (const path of [
  '../examples/tasks/csv-delivery-preflight.json',
  '../examples/tasks/json-api-response-preflight.json',
]) {
  const draft = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  taskDrafts.push(draft);
  test(`Apify task draft ${draft.name} respects publishing limits and passes its synthetic input`, () => {
    assert.match(draft.name, /^[a-z0-9-]{3,63}$/);
    assert.ok(draft.title.length >= 3 && draft.title.length <= 63);
    assert.ok(draft.description.length <= 400);
    assert.ok(draft.publicConfig.seoTitle.length <= 60);
    assert.ok(draft.publicConfig.seoDescription.length <= 160);
    assert.equal(Object.hasOwn(draft, 'isPublic'), false);
    assert.equal(Object.hasOwn(draft.publicConfig, 'publishedAt'), false);
    assert.equal(draft.publicConfig.datasetName, null);
    assert.equal(draft.publicConfig.datasetView, 'overview');
    assert.deepEqual(draft.publicConfig.inputSchemaFields, ['requirements', 'files']);
    assert.ok(draft.publicConfig.inputSchemaFields.every(field => inputSchema.properties[field]));
    assert.ok(datasetSchema.views[draft.publicConfig.datasetView]);
    assert.equal(draft.actId, '9GmfAyI0DFy5PSnjs');
    assert.equal(checkBundle(draft.input).status, 'PASS');
    assert.equal(draft.options.memoryMbytes, 256);
    assert.equal(draft.options.timeoutSecs, 60);
    assert.ok(draft.options.maxTotalChargeUsd > 0);
    assert.ok(draft.options.maxTotalChargeUsd <= 0.02);
  });
}

for (const [scenario, status, input] of [
  ['minimal text', 'PASS', valid],
  ['mixed JSON, CSV, and text', 'PASS', passExample],
  ['Store CSV and JSON prefill', 'PASS', storePrefill],
  ...taskDrafts.map(draft => [draft.name, 'PASS', draft.input]),
  ['missing required file', 'FAIL', { ...valid, files: [] }],
  ['JSON schema failure and missing file', 'FAIL', failExample],
  ['unexpected extra file', 'FAIL', withUnexpectedFile],
  ['invalid specification', 'INVALID_SPEC', {}],
]) {
  test(`local Apify adapter: ${scenario} writes schema-valid ${status} output`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'delivery-check-actor-'));
    try {
      const kv = join(dir, 'key_value_stores', 'default');
      await mkdir(kv, { recursive: true });
      await writeFile(join(kv, 'INPUT.json'), JSON.stringify(input));
      // Whitelist local process settings; never inherit cloud credentials/config.
      const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SystemRoot']
        .filter(key => process.env[key]).map(key => [key, process.env[key]]));
      Object.assign(env, { CRAWLEE_STORAGE_DIR: dir,
        APIFY_PURGE_ON_START: '0', APIFY_DISABLE_OUTDATED_WARNING: '1' });
      await run(process.execPath, [entry], { cwd: dir, env, timeout: 20_000 });
      const report = JSON.parse(await readFile(join(kv, 'OUTPUT.json'), 'utf8'));
      assert.equal(report.status, status);
      const dataset = join(dir, 'datasets', 'default');
      const paths = await readdir(dataset).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      const rows = paths.filter(path => /^\d+\.json$/.test(path));
      assert.equal(rows.length, status === 'INVALID_SPEC' ? 0 : 1);
      if (rows.length) {
        const row = JSON.parse(await readFile(join(dataset, rows[0]), 'utf8'));
        assert.equal(row.status, status);
        assert.ok(validateDatasetRow(row), JSON.stringify(validateDatasetRow.errors));
      } else {
        assert.ok(report.issues.length > 0, 'Invalid input retains actionable diagnostics');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
