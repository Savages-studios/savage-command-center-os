# savage-command-center-os — Ground Truth

**Last verified:** 2026-11-15
**Head:** `2a4a411d7872ff116af9ed48fb3aeb4fc702f797` (main, the base this
landing was built and tested on; the landing commit lands on top of it)
**Evidence labels:** verified = proven in this pass by code read, a run,
or a served-page check · reported = claimed by a repo document, not
re-proven here · not established = no evidence in this pass.

## What this repo is

The shipped Savage Command Center console: a static JS web app
(`index.html` + `app.js` + `ceros-stream.js` + `diamond-feed.js`,
`style.css`, PWA manifest + `sw.js` service worker) with tabbed panels
(BRIEF / CHAIN / AGENTS / OPS / INTEL / CEROS / ESTATE), MetaMask/EIP-1193
wallet and TX-signing UI, in-browser agent/oracle math, an MCP
integrations folder (`integrations/*.js`), and two security modules
(`security/*.js`). `package.json` declares `main: server.js` and
start/dev scripts that run it — **no `server.js` exists in the tree**
(verified: full tree listing at the head above, 48 blobs). The app as
shipped is served statically; that is how the Estate Wall below was
verified (a static file server returning 200 for the page, the wall
script, its core module, and the wall data).

## Component state

- **Panels BRIEF–CEROS** — *verified (code read).* Static markup in
  `index.html`, behaviour in `app.js` / `ceros-stream.js`; tab switching
  is the `data-panel` handler in `app.js`.
- **Live Estate Wall (panel ESTATE, this landing)** — *verified.*
  `estate-wall.js` fetches `data/estate-wall.json` and renders **every**
  repo in the embedded `savage.estate_attestation.v1` artifact — name,
  GT currency verdict, CI state, claims-gated marker, head — plus the
  artifact digest, attested-at time, summary counts, the refresh-time
  verification record, and a staleness banner shown when the attestation
  is older than 24h at view time. When Web Crypto is available the
  browser also recomputes the digest live and reports MATCH/MISMATCH.
  BEFORE this landing: 0 repos with machine-verified status on any wall
  (no estate/attestation view existed — grep-verified). AFTER: **45/45
  repos** from the real artifact rendered (row-renderer test counts one
  row per record, 45).
- **Wall data (`data/estate-wall.json`)** — *verified.* A
  `savage.estate_wall.v1` envelope around the full PROOF-E1 attestation
  artifact: org Savages-studios, attested `2026-11-16T04:05:18Z`,
  digest `bc17fb661014dd9132b76ac2fa6fd04dacc125de387f170a757b8a2aefa9f48c`,
  45 records (GT: 30 DRIFTED · 12 UNPINNED · 3 MISSING · 0 CURRENT;
  CI: 24 PASSING · 7 FAILING · 3 IN_PROGRESS · 3 NOT_PASSING ·
  8 NONE_RECORDED; 2 claims rows attached, 1 gated). It was published by
  `scripts/refresh-estate-wall.mjs` only after three verifications
  passed, all recorded in the envelope: structural validation + summary
  cross-check, JCS/SHA-256 digest recomputation (JS implementation
  reproduced the artifact's digest exactly), and savage-standard's own
  `estate --check` (full re-derivation from the embedded snapshot —
  VERIFIED). The source artifact was reused from PROOF-E1's live
  2026-11-16 run (11 minutes old at publish); no fresher snapshot was
  fetched because a live fetch needs the estate credential.
- **Refresh script (`scripts/refresh-estate-wall.mjs`)** — *verified.*
  Node stdlib only. Refuses (exit 1, output untouched) any artifact that
  fails structural validation, summary cross-check, or digest
  recomputation; runs savage-standard `--check` when given
  `--savage-standard DIR` and records exactly which checks ran.
  Planted control proven: flipping `savage-command-center-os` from
  DRIFTED to CURRENT and recomputing nothing was refused on both the
  summary cross-check and the digest mismatch, and nothing was published.
- **Refresh cadence (`.github/workflows/estate-wall-refresh.yml`)** —
  *verified (file, YAML-parsed; not run on GitHub in this pass).* Every
  6h + manual dispatch. Producing a fresh attestation needs the
  `ESTATE_GITHUB_TOKEN` secret (org-wide read for heads, GROUND_TRUTH
  files, workflow runs); without it the workflow re-verifies and
  republishes the last good artifact rather than fabricating a new one.
- **Tests** — *verified.* The repo previously had **no test files at
  all** (jest is configured with `--passWithNoTests`). This landing adds
  `tests/estate-wall.test.mjs` on the Node stdlib runner
  (`npm run test:estate-wall`): **5/5 pass** — shipped-envelope digest,
  render completeness + gated marker, staleness boundary (stale at
  >24h, fresh at publish), tamper refusal, genuine-artifact republication.
  `node --check` passes on every `.js`/`.mjs` file before and after.
- **Build** — *not established as a gate.* `npm run build` is `tsc` over
  `include: ["*.ts", …]` and the tree contains **zero `.ts` files**;
  TypeScript is not installed in this environment and installing the
  dev-dependency tree was out of scope, so the build was not run. The
  gates actually used are stated above, honestly.

## What is NOT true

- The attestation is **not signed**. The estate signing key is not yet
  minted; the wall displays the SHA-256 digest and the verification
  record and claims no signature (the envelope carries
  `signed: false, signature: null`, and the UI says so).
- The wall is **not a live feed**. It renders the attestation snapshot
  named in the data file; past 24h old it shows a staleness banner
  instead of pretending to be current.
- Digest recomputation alone does **not** catch tampering whose digest
  was honestly recomputed. That requires re-deriving every record from
  the embedded snapshot — savage-standard's `estate --check` — which the
  refresh records when it ran, and does not claim when it did not.
- GT currency is a **citation** check (does a repo's GROUND_TRUTH.md cite
  its current head) and CI state is the **recorded** latest state. The
  attestation does not re-verify GROUND_TRUTH contents and does not
  re-run any repo's test suite.
- This file did not exist before this landing: the repo had no
  `GROUND_TRUTH.md` at the head above (the estate attestation's snapshot
  had recorded this repo's GT as DRIFTED against an earlier head).
- `server.js` still does not exist; the declared `npm start` path remains
  unbuilt. The console's other panels' numeric claims (BRIEF KPIs etc.)
  were not re-verified in this pass.
