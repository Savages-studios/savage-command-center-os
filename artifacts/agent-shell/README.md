# artifacts/agent-shell/ — pointer (de-duplicated 2026-11-11, fix #119)

This directory previously held a second copy of the Vercel API
endpoints (`api/`) and routing config (`vercel.json`) — a snapshot
bundle of the Agent Shell API layer. The copies had drifted from the
live code: the endpoint copies pre-dated the PR #26 / PR #28 security
hardening (wildcard CORS, no write authorization, a success-shaped
fallback for untested connectors), and keeping two copies meant
endpoint fixes had to be applied twice (fix #92 edited both copies
of `github.js` to keep them in step).

**Canonical location — the only live copies:**

- Endpoints: [`/api/`](../../api/) at the repository root
- Routing: [`/vercel.json`](../../vercel.json) at the repository root

**Archived snapshot:** the pre-fix copies are preserved byte-for-byte
under [`/archive/agent-shell-bundle/`](../../archive/agent-shell-bundle/) —
see the README there for the divergence census. Nothing was deleted;
git history also retains the original paths.

Do not deploy, copy, or import from this directory. There is no code
here; the endpoints live in `/api/`.
