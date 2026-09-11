import { Actor } from 'apify';
import { checkBundle } from './check.js';
await Actor.main(async () => {
  const report = checkBundle(await Actor.getInput());
  await Actor.setValue('OUTPUT', report);
  // Invalid specifications have diagnostics in OUTPUT, but no completed report row.
  // This also excludes them from a future dataset-item report event.
  if (report.status !== 'INVALID_SPEC') {
    await Actor.pushData({ status: report.status, totalBytes: report.totalBytes ?? 0, requiredFiles: report.files.length, failedFiles: report.files.filter(f => f.status === 'FAIL').length, issues: report.issues, files: report.files, notChecked: report.notChecked });
  }
  await Actor.setStatusMessage(`${report.status}: ${report.files.length} required files checked.`);
});
