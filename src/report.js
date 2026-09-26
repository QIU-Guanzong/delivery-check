export function summarizeReport(report) {
  const failures = report.issues.map(issue => ({
    file: issue.name ?? '',
    code: issue.code,
    message: issue.message ?? (issue.code === 'UNEXPECTED_FILE'
      ? 'Remove this file or allow files outside the required list.'
      : 'Review the input configuration.'),
  }));
  for (const file of report.files) {
    for (const check of file.checks) {
      if (!check.passed) failures.push({
        file: file.name,
        code: check.code,
        message: check.message ?? `Review the ${check.code} check.`,
        ...(check.details ? { details: check.details } : {}),
      });
    }
  }
  const failedFiles = report.files.filter(file => file.status === 'FAIL').length;
  const summary = report.status === 'INVALID_SPEC'
    ? 'Input needs correction; validation did not run. Open OUTPUT for details.'
    : report.status === 'PASS'
      ? `All ${report.files.length} required files passed the configured checks.`
      : `${failedFiles} of ${report.files.length} required files failed; ${report.issues.length} bundle issues.`;
  return { summary, failedFiles, failures };
}

const textValue = value => String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/gu,
  character => `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`);

export function reportText(report, summary) {
  const lines = [
    `Delivery Check: ${report.status}`,
    summary.summary,
    `Required files: ${report.files.length}`,
    `Input bytes: ${report.totalBytes ?? 'not evaluated'}`,
    '',
  ];
  if (summary.failures.length) {
    lines.push('What to fix');
    for (const failure of summary.failures) {
      lines.push(`- ${textValue(failure.file || 'Input')} [${textValue(failure.code)}]: ${textValue(failure.message)}`);
      if (failure.details?.expectedHeaders) {
        lines.push(`  Expected headers: ${textValue(JSON.stringify(failure.details.expectedHeaders))}`,
          `  Actual headers: ${textValue(JSON.stringify(failure.details.actualHeaders))}`);
        if (failure.details.headersTruncated) lines.push('  Header previews are truncated; see counts in OUTPUT.');
      }
    }
  } else {
    lines.push('No failed checks.');
  }
  lines.push('', 'PASS means the supplied contents meet the configured rules. It does not establish content truth or customer acceptance.',
    'The complete machine-readable report is stored in OUTPUT.');
  return `${lines.join('\n')}\n`;
}
