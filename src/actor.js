import { Actor } from 'apify';
import { checkBundle } from './check.js';
import { summarizeReport, reportText } from './report.js';
await Actor.main(async () => {
  const report = checkBundle(await Actor.getInput());
  const summary = summarizeReport(report);
  await Actor.setValue('OUTPUT', report);
  await Actor.setValue('REPORT.txt', reportText(report, summary), { contentType: 'text/plain; charset=utf-8' });
  // Invalid specifications have diagnostics in OUTPUT, but no completed report row.
  // This also excludes them from a future dataset-item report event.
  if (report.status !== 'INVALID_SPEC') {
    await Actor.pushData({ status: report.status, totalBytes: report.totalBytes ?? 0, requiredFiles: report.files.length, ...summary, issues: report.issues, files: report.files, notChecked: report.notChecked });
  }
  await Actor.setStatusMessage(`${report.status}: ${summary.summary}`);
});
