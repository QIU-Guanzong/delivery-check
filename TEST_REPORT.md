# Test evidence

2026-09-11. Prototype 0.1.0, macOS arm64, Node 24.19.0 (also passed under Node 26.0.0, outside the supported range). The Node 22 cloud image built and ran successfully on Apify.

- 21 automated tests passed. Coverage includes missing/duplicate/unexpected files, exact UTF-8 byte counts, known SHA-256 and mismatches, JSON syntax and schema errors, false boolean schemas, unsupported schemas, quoted CSV commas/newlines, CRLF/BOM, header order, row counts, malformed CSV, path-like names, limits, surrogate encoding and input immutability.
- CLI passing sample exited 0 with PASS; failing sample exited 1 with FAIL. The failing sample identifies an incorrectly typed JSON count and missing evidence file.
- The existing RGB-to-Hex deliverable passed its required-file and 22,000-byte ceiling checks. This checks packaging only, not the HTML's behavior, accessibility or bounty acceptance. See `examples/rgb-size-report.json`.
- The Apify SDK adapter ran locally with the passing sample. Status was PASS with three required files; key-value OUTPUT and dataset output were inspected and matched the core report.
- Apify cloud tests: passing input produced PASS with three required files and 88 bytes. Failing run `1eynaGPuEwJs2IrKo` produced FAIL with two failed files: `/count` must be integer, and `test-report.md` was absent.
- The first output configuration attempted to embed a JSON record and Chrome blocked that preview. Commit `1e3c9cc` switches the default output to the dataset table; cloud build `0.0.2` and passing run `98waKpeMQKxEqyjd2` verified the corrected default table, PASS / 3 required / 0 failed / 88 bytes, with the full OUTPUT record retained.
- No paid event, customer sale or payout has occurred. Cloud runs use the existing free allowance; displayed per-run rounding is not an exact total cost.

No file body is copied into output reports. User-provided names and JSON field paths can appear in output. No browser, downloaded code, customer account or model is used by the checker.

Cloud Actor: https://console.apify.com/actors/9GmfAyI0DFy5PSnjs . Two successful builds and four runs, including one repeated passing input before the failing input was applied. Store publication is verified at https://apify.com/grayt/delivery-check after user agreement to the publishing terms. No developer monetization is enabled.

## HTTP adapter (2026-09-11)

All 26 tests pass under Node 24.19.0: 21 core checks plus 5 HTTP tests using real loopback requests. HTTP checks cover missing/wrong gateway secret, PASS/FAIL reports, invalid contract/JSON/media and declared/chunked body limits. Adapter binds to loopback by default, has request timeouts and requires gateway secret configuration. RapidAPI public forwarding, public TLS, quotas, load and billing are not yet verified. No backend is deployed.

## Apify report row guard and MCP discovery (2026-09-11)

All 29 tests pass on Node 24.19.0. Three new real local SDK subprocess tests inspect persisted storage: PASS/FAIL each create one dataset row, INVALID_SPEC creates zero rows and preserves diagnostics in OUTPUT. The initial test harness incorrectly set APIFY_IS_AT_HOME=0 (the SDK treats any nonempty value as cloud mode); removing that variable fixed the harness. No cloud credentials were used. This is storage behavior evidence, not a paid billing test.

The official hosted MCP server returned grayt/delivery-check via fetch-actor-details, including its input and inferred output schemas. Public pricing was FREE; users displayed 2 total / 1 monthly, which does not prove customers or revenue. A delivery-check keyword search did not return our Actor. Discovery used only free search/details operations, no wallet, prepayment, or Actor execution. This revision has not yet been built or verified in the cloud.
