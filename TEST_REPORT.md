# Test evidence

2026-09-11. Prototype 0.1.0, macOS arm64, Node 24.19.0 (also passed under Node 26.0.0, outside the supported range). Cloud Node 22 verification is pending.

- 21 automated tests passed. Coverage includes missing/duplicate/unexpected files, exact UTF-8 byte counts, known SHA-256 and mismatches, JSON syntax and schema errors, false boolean schemas, unsupported schemas, quoted CSV commas/newlines, CRLF/BOM, header order, row counts, malformed CSV, path-like names, limits, surrogate encoding and input immutability.
- CLI passing sample exited 0 with PASS; failing sample exited 1 with FAIL. The failing sample identifies an incorrectly typed JSON count and missing evidence file.
- The existing RGB-to-Hex deliverable passed its required-file and 22,000-byte ceiling checks. This checks packaging only, not the HTML's behavior, accessibility or bounty acceptance. See `examples/rgb-size-report.json`.
- The Apify SDK adapter ran locally with the passing sample. Status was PASS with three required files; key-value OUTPUT and dataset output were inspected and matched the core report.
- No cloud run, paid event, customer sale or payout is claimed by this local test report.

No file body is copied into output reports. User-provided names and JSON field paths can appear in output. No browser, downloaded code, customer account or model is used by the checker.
