# Browser preview validation

Checked 2026-09-12. This is a free, single-file browser preview; no new hosted service, checkout or customer revenue is claimed.

- Node 22.22.3: `node --test`, 39 passed, 0 failed. Existing CLI, HTTP, ACP and local Apify adapter contracts still pass.
- `node web/build.js`: builds a standalone HTML with bundled JavaScript, CSS and license notices. No external assets; connection requests blocked by CSP.
- In-app Chromium through a loopback HTTP server: CSV sample PASS, row-count FAIL, JSON sample PASS, boolean-false schema FAIL and remote-reference schema INVALID_SPEC.
- Real file chooser: BOM + CRLF + Unicode CSV retained its 27 bytes and SHA-256 `cc123a4d2d9ab5b6e7b7da5950f426c8cb4d620b32f58adb500688fbc28fd3a0`, independently matched against the file on disk.
- Download button wrote `delivery-check-report.json`. The browser download-event waiter timed out, but the actual downloaded artifact was located and parsed; its status, byte count and fingerprint matched, and it did not contain file bodies.
- Invalid UTF-8 and 1 MiB + 1 byte inputs were rejected, Check was disabled, and the old successful report was removed. Editing rules invalidated the previous report.
- 390 px viewport had no horizontal overflow; desktop and mobile screenshots inspected. Browser console had no errors during functional checks.
- Direct `file://` navigation was blocked by the browser automation URL policy. This direct-open path was not tested, and no alternate browser or protocol was used to circumvent the block. The local HTTP path above was tested before that attempt. Safari/Firefox and native double-click behavior remain unverified.

The shared checker now uses TextEncoder and a pinned portable SHA-256 library, compared with Node crypto on empty, multi-block and Unicode inputs. CSV browser builds use the upstream browser parser export. No Apify SDK is bundled in the browser artifact.

`npm audit` reported 4 moderate entries in the existing Apify dependency tree (`apify`, `@crawlee/core`, `stream-json`, `adm-zip`). They are outside the browser bundle; no claim of a clean entire-repository audit is made. Broad SDK changes are outside this preview. The existing cloud Actor was not rebuilt as part of this browser delivery.
