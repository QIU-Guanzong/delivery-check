import { readFile, stat } from 'node:fs/promises';
import { checkBundle, LIMITS } from './check.js';
try {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw new Error('Usage: npm run check -- input.json');
  if ((await stat(path)).size > LIMITS.inputBytes) throw new Error('Input file exceeds 6 MiB.');
  const report = checkBundle(JSON.parse(await readFile(path, 'utf8')));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 2;
} catch (error) {
  console.error(JSON.stringify({ status: 'INVALID_SPEC', message: error.message }));
  process.exitCode = 2;
}
