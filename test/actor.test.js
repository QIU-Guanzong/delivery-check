import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const entry = fileURLToPath(new URL('../src/actor.js', import.meta.url));
const valid = { requirements: [{ name: 'a.txt', kind: 'text', maxBytes: 100 }],
  files: [{ name: 'a.txt', content: 'hello' }] };

for (const [status, input] of [
  ['PASS', valid], ['FAIL', { ...valid, files: [] }], ['INVALID_SPEC', {}],
]) {
  test(`local Apify adapter: ${status} diagnostics and report rows`, async () => {
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
        assert.equal(JSON.parse(await readFile(join(dataset, rows[0]), 'utf8')).status, status);
      } else {
        assert.ok(report.issues.length > 0, 'Invalid input retains actionable diagnostics');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
