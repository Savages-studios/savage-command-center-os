// Estate Wall — shared pure core (Savage-original, zero dependencies).
//
// One implementation, three callers:
//   * scripts/refresh-estate-wall.mjs — verifies an attestation before
//     publishing it to data/estate-wall.json (Node, node:crypto SHA-256).
//   * estate-wall.js — the browser view; recomputes the same digest with
//     Web Crypto when available and applies the same staleness rule.
//   * tests/estate-wall.test.mjs — the planted controls.
//
// The digest rule is the artifact's own (savage.estate_attestation.v1,
// PROOF-E1): SHA-256 over the RFC 8785 JCS canonical form of the artifact
// without its `digest` field. The JCS implementation below is written
// from RFC 8785: object keys sorted by UTF-16 code unit, minimal string
// escaping, ECMAScript Number.prototype.toString for numbers (which is
// exactly what String(number) does in a JS engine). It was validated
// byte-for-byte against the Python savage-standard canonicalizer on the
// real 45-repo artifact (digest bc17fb661014dd91…f48c, reproduced).
//
// Honesty boundary: digest recomputation catches any tampering that does
// not also recompute the digest. Catching a verdict flip whose digest WAS
// honestly recomputed requires re-deriving every record from the embedded
// snapshot — that is savage-standard's `estate --check`, which the refresh
// script runs whenever a savage-standard checkout is provided, and whose
// result is recorded in the published envelope.

export const ATTESTATION_KIND = 'savage.estate_attestation.v1';
export const WALL_KIND = 'savage.estate_wall.v1';
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const GT_CURRENCIES = ['CURRENT', 'DRIFTED', 'UNPINNED', 'MISSING'];
export const CI_STATES = [
  'PASSING', 'FAILING', 'IN_PROGRESS', 'NOT_PASSING', 'NONE_RECORDED',
];

// ── RFC 8785 JCS ──────────────────────────────────────────────────────

function jcsString(s) {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\r') out += '\\r';
    else if (cp < 0x20) out += '\\u' + cp.toString(16).padStart(4, '0');
    else if (cp >= 0xd800 && cp <= 0xdfff) {
      throw new Error('JCS: lone surrogate in string');
    } else out += ch;
  }
  return out + '"';
}

export function jcs(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS: non-finite number');
    return String(value); // ECMAScript Number.prototype.toString
  }
  if (typeof value === 'string') return jcsString(value);
  if (Array.isArray(value)) return '[' + value.map(jcs).join(',') + ']';
  if (typeof value === 'object') {
    // JS string comparison is by UTF-16 code unit — the RFC 8785 order.
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return '{' + keys.map((k) => jcsString(k) + ':' + jcs(value[k])).join(',') + '}';
  }
  throw new Error('JCS: uncanonicalizable type ' + typeof value);
}

/** The exact byte string the artifact digest is computed over. */
export function canonicalCore(artifact) {
  const core = {};
  for (const [k, v] of Object.entries(artifact)) {
    if (k !== 'digest') core[k] = v;
  }
  return jcs(core);
}

// ── Structural validation + summary cross-check ───────────────────────

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isSha256 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{7,40}$/i.test(v);

/**
 * Validate an attestation's structure and internal consistency (summary
 * counts recomputed from the records; the failures list recomputed from
 * the records' own failure strings). Returns a list of problems; an empty
 * list means structurally sound. This does NOT re-derive records from the
 * snapshot — see the honesty boundary in the header.
 */
export function structuralProblems(artifact) {
  const p = [];
  if (!isObj(artifact)) return ['artifact is not a JSON object'];
  if (artifact.kind !== ATTESTATION_KIND) {
    p.push(`kind: expected ${ATTESTATION_KIND}, found ${JSON.stringify(artifact.kind)}`);
  }
  if (typeof artifact.org !== 'string' || !artifact.org) p.push('org: missing');
  if (typeof artifact.taken_at !== 'string' || Number.isNaN(Date.parse(artifact.taken_at))) {
    p.push('taken_at: missing or not a parseable timestamp');
  }
  if (!isSha256(artifact.digest)) p.push('digest: missing or not a SHA-256 hex string');
  if (!isObj(artifact.snapshot)) p.push('snapshot: missing or not an object');
  else {
    if (artifact.snapshot.org !== artifact.org) p.push('snapshot.org does not match org');
    if (artifact.snapshot.taken_at !== artifact.taken_at) {
      p.push('snapshot.taken_at does not match taken_at');
    }
    if (!Array.isArray(artifact.snapshot.repos)) p.push('snapshot.repos: not a list');
  }
  if (!Array.isArray(artifact.records) || artifact.records.length === 0) {
    p.push('records: missing, not a list, or empty — refusing to publish an empty wall');
    return p;
  }
  const seen = new Set();
  artifact.records.forEach((r, i) => {
    const tag = isObj(r) && typeof r.repo === 'string' ? r.repo : `records[${i}]`;
    if (!isObj(r)) { p.push(`${tag}: record is not an object`); return; }
    if (typeof r.repo !== 'string' || !r.repo) p.push(`${tag}: repo name missing`);
    else if (seen.has(r.repo)) p.push(`${tag}: duplicate repo record`);
    else seen.add(r.repo);
    if (!isSha(r.head)) p.push(`${tag}: head missing or not a hex sha`);
    if (!isObj(r.gt)) p.push(`${tag}: gt missing`);
    else {
      if (typeof r.gt.present !== 'boolean') p.push(`${tag}: gt.present not boolean`);
      if (!GT_CURRENCIES.includes(r.gt.currency)) {
        p.push(`${tag}: gt.currency ${JSON.stringify(r.gt.currency)} not one of ${GT_CURRENCIES.join('/')}`);
      }
      if (r.gt.currency === 'MISSING' && r.gt.present !== false) {
        p.push(`${tag}: gt.currency MISSING but gt.present is not false`);
      }
      if (r.gt.currency === 'CURRENT' && !(typeof r.gt.cited_head === 'string' && r.gt.cited_head)) {
        p.push(`${tag}: gt.currency CURRENT but no cited_head`);
      }
    }
    if (!isObj(r.ci) || !CI_STATES.includes(r.ci.state)) {
      p.push(`${tag}: ci.state missing or not one of ${CI_STATES.join('/')}`);
    } else if (r.ci.workflows !== undefined && !Array.isArray(r.ci.workflows)) {
      p.push(`${tag}: ci.workflows not a list`);
    }
    if (!Array.isArray(r.claims)) p.push(`${tag}: claims not a list`);
    else r.claims.forEach((c) => {
      if (!isObj(c) || typeof c.id !== 'string' || typeof c.gated !== 'boolean') {
        p.push(`${tag}: claim row malformed (needs {id: string, gated: boolean})`);
      }
    });
    if (!Array.isArray(r.failures) || r.failures.some((f) => typeof f !== 'string')) {
      p.push(`${tag}: failures not a list of strings`);
    }
  });
  // Summary recomputed from the records must match the stored summary.
  if (!isObj(artifact.summary)) p.push('summary: missing or not an object');
  else {
    const want = {
      repos_attested: artifact.records.length,
      gt_present: artifact.records.filter((r) => isObj(r.gt) && r.gt.present).length,
      gt_current: artifact.records.filter((r) => isObj(r.gt) && r.gt.currency === 'CURRENT').length,
      ci_passing: artifact.records.filter((r) => isObj(r.ci) && r.ci.state === 'PASSING').length,
      claims_rows_attached: artifact.records.reduce(
        (n, r) => n + (Array.isArray(r.claims) ? r.claims.length : 0), 0),
      claims_gated: artifact.records.reduce(
        (n, r) => n + (Array.isArray(r.claims) ? r.claims.filter((c) => c && c.gated).length : 0), 0),
    };
    for (const [k, v] of Object.entries(want)) {
      if (artifact.summary[k] !== v) {
        p.push(`summary.${k}: artifact has ${JSON.stringify(artifact.summary[k])}, records give ${v}`);
      }
    }
  }
  // The flat failures list must be exactly the records' failures, in order.
  if (Array.isArray(artifact.failures)) {
    const want = [];
    for (const r of artifact.records) {
      if (isObj(r) && Array.isArray(r.failures)) {
        for (const reason of r.failures) want.push({ repo: r.repo, reason });
      }
    }
    if (JSON.stringify(artifact.failures) !== JSON.stringify(want)) {
      p.push('failures: flat list does not match the records\' failure strings');
    }
  } else p.push('failures: missing or not a list');
  return p;
}

// ── Staleness ─────────────────────────────────────────────────────────

/** Age of an attestation in ms at `nowMs`; NaN when unparseable. */
export function attestationAgeMs(attestedAt, nowMs) {
  const t = Date.parse(attestedAt);
  if (Number.isNaN(t)) return NaN;
  return nowMs - t;
}

/** Stale = attested more than 24h before `nowMs` (or unparseable). */
export function isStale(attestedAt, nowMs, thresholdMs = STALE_AFTER_MS) {
  const age = attestationAgeMs(attestedAt, nowMs);
  return Number.isNaN(age) || age > thresholdMs;
}

// ── Rendering helpers (shared by the browser view and the tests) ──────

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** The claims-gated marker text for one record: gated ids, or markers. */
export function claimsMarker(record) {
  const claims = Array.isArray(record.claims) ? record.claims : [];
  if (claims.length === 0) return '—';
  return claims
    .map((c) => `${c.id} ${c.gated ? '⛔ GATED' : '○ ungated'}`)
    .join(', ');
}

/** One wall row as HTML. Pure string building — testable without a DOM. */
export function rowHtml(record) {
  const gated = (record.claims || []).some((c) => c.gated);
  return '<tr data-repo="' + escapeHtml(record.repo) + '">'
    + '<td class="estate-repo">' + escapeHtml(record.repo) + '</td>'
    + '<td><span class="estate-badge estate-badge--gt-' + escapeHtml(record.gt.currency.toLowerCase()) + '">'
    + escapeHtml(record.gt.currency) + '</span></td>'
    + '<td><span class="estate-badge estate-badge--ci-' + escapeHtml(record.ci.state.toLowerCase()) + '">'
    + escapeHtml(record.ci.state) + '</span></td>'
    + '<td class="estate-claims' + (gated ? ' estate-claims--gated' : '') + '">'
    + escapeHtml(claimsMarker(record)) + '</td>'
    + '<td class="estate-head"><code>' + escapeHtml(String(record.head || '').slice(0, 12)) + '</code></td>'
    + '</tr>';
}
