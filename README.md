# Delivery Check

Check a small bundle before you submit it. Catch missing evidence, oversized files, changed hashes, invalid JSON and incorrect CSV layouts in one report.

For developers and agents handing off text deliverables. The checker uses deterministic rules, with no model calls or external URL requests. A PASS means the supplied files meet the configured checks; it does not mean a customer accepted the work or that its content is true.

## Quick start

Requires Node.js 22 or 24 and npm.

```sh
npm ci --ignore-scripts
npm test
npm run check -- examples/pass.json
npm run check -- examples/fail.json
```

The CLI exits with `0` for PASS, `1` for a failed delivery, and `2` for an invalid specification/input. Use `node src/cli.js input.json` for clean JSON output without npm's banner.

## Input

Provide `requirements` and `files`. File contents are UTF-8 strings inside the input JSON. Names are labels, not filesystem paths or URLs. Every requirement is mandatory. Unlisted files fail unless `allowExtraFiles` is true; allowed extras have no per-file contract checks.

```json
{
  "requirements": [
    {"name": "result.json", "kind": "json", "maxBytes": 10000,
     "jsonSchema": {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}},
    {"name": "evidence.md", "kind": "text", "maxBytes": 10000}
  ],
  "files": [
    {"name": "result.json", "content": "{\"ok\":true}"},
    {"name": "evidence.md", "content": "Two synthetic checks passed."}
  ]
}
```

### File checks

| Rule | What is checked |
|---|---|
| `name` | Exact match to a supplied file; duplicates and paths are rejected |
| `kind` | `text`, `json`, or `csv`; this selects a parser, not a filename extension |
| `maxBytes` | Actual UTF-8 byte count, inclusive |
| `sha256` | Optional expected digest of the exact UTF-8 contents |
| `jsonSchema` | Optional bounded draft-07 schema; no coercion, defaults or repairs |
| `csv.headers` | Required for CSV; exact ordered header names |
| `csv.minRows` / `maxRows` | Inclusive data-row count, excluding the header and empty lines |

CSV uses commas and standard quoted fields; CRLF, embedded quoted newlines and an initial BOM are supported. Whitespace is preserved. Inconsistent row widths fail. Text rules check size/encoding/hash only. HTML can be submitted as text, but rendering, scripts and accessibility are not checked.

### Limits

32 required files and 32 supplied files; 1 MiB per file; 4 MiB total decoded contents; 6 MiB serialized input; nesting up to 48 levels. Filenames use ASCII letters, digits, spaces, `_`, `-` and `.`, starting with a letter or digit. No ZIP, binary uploads, remote fetches, local directory traversal or script execution.

JSON schemas are limited to 16,000 characters and 12 schema levels. Common type, required-field, property, item, enum, const, numeric and length constraints are supported. References, regex, formats, combinators (`allOf`/`anyOf`/`oneOf`/`not`), conditional schemas, dependencies and `uniqueItems` are deliberately rejected. Unsupported keywords fail as INVALID_SPEC rather than being silently ignored. JSON duplicate keys follow standard `JSON.parse` behavior (last value wins); duplicate-key detection is not provided. CSV records are limited to 65,536 characters.

## Results

The report separates `PASS`, `FAIL` and `INVALID_SPEC`. Each required file lists checks, byte size and SHA-256. JSON schema failures include the offending field path and rule. Reports do not echo whole file bodies, but names, hashes and field paths may still be sensitive.

See [sample output](examples/pass-report.json) and [failure output](examples/fail-report.json). On Apify, the full report is saved as key-value record `OUTPUT`; a one-row dataset summary includes the per-file checks. A successful Actor run can contain a FAIL report: the checker ran successfully and found a failed delivery. Check the report's status rather than the Actor process status.

## Privacy and cloud use

The local CLI reads only the input file you explicitly pass; the core never opens paths from the contract. Running on Apify sends and stores the submitted input on Apify infrastructure. Do not submit secrets or material you lack permission to process. The actor itself makes only the SDK storage/status calls needed for its own run and does not send contents to a model or external site. Platform retention/access settings govern cloud records.

## Apify deployment

Import this repository through My Actors → Connect Git. The `.actor` folder includes Dockerfile and input/output schemas. Start with `examples/pass.json`, then `examples/fail.json`; inspect OUTPUT and the dataset for the expected statuses. Use limited permissions, 256 MiB memory and a 60-second run timeout. No recurring schedule or Standby mode is needed.

This prototype does not emit paid events or claim agentic-payment eligibility. Any listing initially uses pay-per-usage (platform runtime costs only, no developer event charge). Charging for service events and payout onboarding are separate steps. Recheck actual usage before setting prices.

## Implementation

`src/check.js` is reusable without Apify. `src/cli.js` reads one JSON input. `src/actor.js` adapts the same checker to Apify. An ACP adapter could call the same function later; ACP integration is not included in this release.

MIT licensed. Runtime dependencies are pinned in package-lock.json. AJV validates contracts; csv-parse handles quoted CSV; the Apify SDK stores Actor outputs. See [test evidence](TEST_REPORT.md) for the checks actually run.
