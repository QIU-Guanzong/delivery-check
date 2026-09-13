# Apify task page drafts

These are Apify API create-task request drafts, not saved or published tasks. Each includes a slug, page title and description, complete input, public SEO configuration, selected input fields, dataset view, and a per-run charge cap.

| File | Search intent |
|---|---|
| `csv-delivery-preflight.json` | Check a CSV export's exact headers and row count before delivery |
| `json-api-response-preflight.json` | Validate a JSON API response against a bounded JSON Schema |

Each task caps a sample run at $0.02. Inputs contain synthetic data only. The create-task API does not accept the server-controlled `isPublic` or `publishedAt` fields, so these drafts deliberately omit both and never request publication. Creating a task requires authenticated write access; publishing is a separate update action and makes its selected input examples public. This folder does not call Apify, create saved tasks, or publish external pages. Review the public preview and developer-name visibility before publishing.
