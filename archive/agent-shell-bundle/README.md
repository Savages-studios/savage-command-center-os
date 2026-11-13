# archive/agent-shell-bundle/ — archived duplicate of `api/` (2026-11-11, fix #119)

Verbatim archive of the files that lived under `artifacts/agent-shell/`
until fix #119 (fix-program queue row D2: artifacts duplicated between
locations with diverging content). They were a second copy of the live
Vercel API layer, frozen at a pre-hardening generation. The canonical
copies — the ones Vercel deploys and the test suite pins — are
[`/api/`](../../api/) and [`/vercel.json`](../../vercel.json) at the
repository root. A pointer remains at
[`artifacts/agent-shell/`](../../artifacts/agent-shell/).

## Divergence census (state at archive time, vs the canonical copies)

| Archived file | Canonical file | State |
|---|---|---|
| `api/connections.js` | `/api/connections.js` | DIVERGENT — pre-PR #26 generation: wildcard CORS (`Access-Control-Allow-Origin: *`), no integration-ID validation, and a generic fallback that answered `ok: true` ("Credentials stored. Manual verification required") for connectors with no real tester — the simulated-success behavior PR #26 ended on the canonical copy |
| `api/decisions.js` | `/api/decisions.js` | DIVERGENT — pre-PR #28 generation: no `requireWriteAuthorization` gate, wildcard CORS, `OPTIONS` answered 200 instead of 204 |
| `api/github.js` | `/api/github.js` | IDENTICAL — byte-for-byte duplicate (blob `f9effe6abc`); archived because two live copies of one endpoint are the drift hazard itself (fix #92 had to edit both) |
| `api/organism-status.js` | `/api/organism-status.js` | DIVERGENT — pre-PR #28 generation: no `requireWriteAuthorization` gate on `PUT`, wildcard CORS on all methods |
| `vercel.json` | `/vercel.json` | SAME ROUTES — byte-divergent, semantically identical (compact vs expanded formatting, trailing newline) |

The archived endpoint copies do not even contain the `_write-auth.mjs`
module the canonical mutations depend on (`api/_write-auth.mjs` has no
counterpart here): they are not an older build of the current
architecture, they are the architecture before it.

## What the archived generation uniquely contains

Nothing the live system needs. Every line unique to these copies is
the pre-hardening behavior PRs #26/#28 deliberately removed from the
canonical endpoints (wildcard CORS, unauthenticated mutations, the
success-shaped connector fallback). That behavior is preserved here —
and in git history — as the record of the defect, not as a merge
candidate: there is no unreconciled content owed back to the canonical
copies.

## Rules for this archive

- Do not deploy, copy, or import from this directory.
- Do not edit the archived files to "keep them in step" — that is the
  dual-maintenance trap this fix removes. The intel test suites
  (`tests/github-intel-public.test.mjs`,
  `tests/github-owner-default.test.mjs`) pin the canonical
  `api/github.js` only, as of fix #119.
