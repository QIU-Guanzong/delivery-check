# Delivery Check: local ACP handler prototype

Status, 2026-09-12: **local contract adapter tested; no ACP deployment or paid order**.

The adapter reuses `checkBundle` without model calls, URL retrieval, wallet access,
or a new runtime dependency. The documented ACP Serve envelope is:

```json
{
  "requirements": {
    "requirements": [{ "name": "result.json", "kind": "json", "maxBytes": 1024 }],
    "files": [{ "name": "result.json", "content": "{\"count\":2}" }]
  }
}
```

The outer `requirements` is the ACP job payload; the inner one is Delivery Check's
file contract. A valid contract produces `{ "deliverable": "<serialized report>" }`.
Both PASS and FAIL are completed checks. INVALID_SPEC throws a sanitized error
with code `INVALID_SPEC` and a short reason instead of producing a deliverable.
**This does not establish ACP payment or refund behavior for failed handlers.**
Those behaviors must be tested before accepting real orders.

Reports contain filenames, check outcomes, byte counts, hashes, and exclusions;
they do not echo file contents or ACP transport metadata. Input must use inline
text and respects the existing limits: 32 files, 1 MiB decoded per file, 4 MiB
decoded per bundle, and 6 MiB serialized bundle. ACP transport limits and body
limits before JSON parsing remain the responsibility of a future server adapter.
Do not submit confidential customer data until transport storage and retention
have been reviewed.

## Local verification

From the project directory:

```sh
node --test test/acp.test.js
node --test
```

Verified on Node 22.22.3: **5 adapter tests and all 34 project tests passed**.
Coverage includes correct report delivery, failed content versus invalid
contracts, missing/malformed envelopes, URL-only files, prohibited schema
references, decoded byte limits, cyclic values, unchanged inputs, and omission
of file contents and transport metadata from the response.

The `handler.ts` entry point simply re-exports `handler.js` to match the documented
filename. A direct import of that TypeScript entry on Node 22.22.3 processed the
existing `examples/pass.json` and returned PASS. This was a local invocation,
not an ACP CLI invocation.

## Compatibility issue found before installation

The official [ACP Serve documentation](https://os.virtuals.io/acp/cli/acp-serve)
describes `acp serve init/start/deploy`, `handler.ts`, and an import from
`acp-cli/serve/types`. However, the inspected official npm release
[`@virtuals-protocol/acp-cli` 1.0.35](https://www.npmjs.com/package/@virtuals-protocol/acp-cli/v/1.0.35)
contains no `serve` command declaration or published `serve/types` module.
The [official GitHub repository](https://github.com/Virtual-Protocol/acp-cli)
main tree inspected at the same time also has no serve implementation. Its
offering create command does not expose the documented `--from-file` option.

This is evidence of a documentation/package mismatch, not proof that ACP Serve
is unavailable through every distribution channel. `compatibility-check.json`
records the inspected release, archive hash, source tree revision, command
declarations, and check time. No ACP package was installed or executed.

## What remains before selling

1. Identify an official released Serve runtime compatible with the documentation,
   or implement the separately documented native job lifecycle. Verify the actual
   handler input/output types, error behavior, module bundling, and dependencies.
   Copying this directory alone will not package `src/check.js` and its libraries.
2. Complete provider identity and wallet authorization in the native platform UI.
   No identity, signer, wallet, or public offering has been created here.
3. Confirm seller eligibility, hosting costs, gas sponsorship, payout costs, and
   any required funds. Remain within the existing no-new-cash constraint.
4. Register a fixed-price, service-only offering with an explicit inline input
   schema, supported limits, and report definition. Do not request working capital.
5. Verify funding before work, request limits, retries/idempotency, invalid-input
   handling, privacy, and payment completion in the actual runtime. Use the
   [provider workflow](https://os.virtuals.io/acp/cli/provider-workflow) as a
   lifecycle reference. A local PASS is not an escrow or payout test.

There is no published ACP endpoint, customer order, or new revenue from this work.
