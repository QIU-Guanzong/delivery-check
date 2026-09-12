import { checkBundle } from '../src/check.js';

// ACP Serve documents input.requirements as the customer's offering payload.
// The entire existing Delivery Check bundle belongs in that field.
export default async function handler(input) {
  const report = checkBundle(input?.requirements);
  if (report.status === 'INVALID_SPEC') {
    // Do not submit an invalid contract as a completed validation report.
    // Payment/refund behavior remains the responsibility of the ACP runtime.
    const error = new Error('Invalid Delivery Check requirements. Supply a supported inline file bundle.');
    error.code = 'INVALID_SPEC';
    error.reason = report.issues[0]?.code;
    throw error;
  }
  return { deliverable: JSON.stringify(report) };
}
