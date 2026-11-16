// Live Estate Wall — renders data/estate-wall.json (the verified envelope
// produced by scripts/refresh-estate-wall.mjs from a
// savage.estate_attestation.v1 artifact, PROOF-E1).
//
// Rendering is honest by construction:
//   * every repo in the artifact gets a row — no filtering, no cherry-pick;
//   * the digest and the refresh-time verification record are shown as
//     recorded, and when Web Crypto is available the digest is ALSO
//     recomputed live in the browser over the same JCS canonical form;
//   * an attestation older than 24h shows a staleness banner, computed at
//     view time from attested-at — not baked in at publish time;
//   * the wall states that the attestation is unsigned (the estate signing
//     key is not yet minted) and never claims a signature.
import {
  canonicalCore, escapeHtml, isStale, rowHtml, STALE_AFTER_MS,
} from './lib/estate-wall-core.mjs';

const DATA_URL = 'data/estate-wall.json';

function el(id) { return document.getElementById(id); }

function renderError(msg) {
  const box = el('estate-error');
  if (box) { box.style.display = 'block'; box.textContent = msg; }
}

async function browserDigest(artifact) {
  const span = el('estate-browser-digest');
  if (!span) return;
  if (!window.crypto || !crypto.subtle) {
    span.textContent = 'browser digest check unavailable (no Web Crypto in this context)';
    return;
  }
  try {
    const bytes = new TextEncoder().encode(canonicalCore(artifact));
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    span.textContent = hex === artifact.digest
      ? 'browser-recomputed digest: MATCH ✓'
      : 'browser-recomputed digest: MISMATCH ✗ (' + hex.slice(0, 16) + '…)';
    span.className = hex === artifact.digest ? 'estate-ok' : 'estate-bad';
  } catch (e) {
    span.textContent = 'browser digest check failed: ' + e.message;
  }
}

function render(envelope) {
  const artifact = envelope.artifact;
  const v = envelope.verification || {};
  const s = artifact.summary || {};
  const records = artifact.records || [];

  el('estate-org').textContent = artifact.org;
  el('estate-attested-at').textContent = artifact.taken_at;
  el('estate-digest').textContent = artifact.digest;
  el('estate-verification').textContent =
    (v.status || 'UNKNOWN') + ' at ' + (v.verified_at || '—')
    + ' — ' + ((v.methods || []).join(' · ') || 'no methods recorded');
  el('estate-signed').textContent = envelope.signed
    ? 'signed'
    : 'UNSIGNED — estate signing key not yet minted; digest + verification record only, no signature claimed';

  el('estate-counts').innerHTML = [
    ['repos attested', s.repos_attested],
    ['GT present', s.gt_present],
    ['GT current', s.gt_current],
    ['CI passing', s.ci_passing],
    ['claims rows', s.claims_rows_attached],
    ['claims gated', s.claims_gated],
    ['named failures', (artifact.failures || []).length],
  ].map(([label, n]) =>
    '<div class="kpi-card"><span class="kpi-card__value">'
    + escapeHtml(n === undefined ? '—' : n)
    + '</span><span class="kpi-card__label">' + escapeHtml(label) + '</span></div>',
  ).join('');

  el('estate-rows').innerHTML = records.map(rowHtml).join('');
  el('estate-rendered-count').textContent =
    records.length + ' of ' + records.length + ' repos rendered';

  const stale = isStale(artifact.taken_at, Date.now(), STALE_AFTER_MS);
  const banner = el('estate-stale-banner');
  if (banner) {
    banner.style.display = stale ? 'block' : 'none';
    if (stale) {
      const ageH = ((Date.now() - Date.parse(artifact.taken_at)) / 3600000).toFixed(1);
      banner.textContent = '⚠ STALE — this attestation is ' + ageH
        + 'h old (attested ' + artifact.taken_at + '). Estate status may have '
        + 'moved since it was machine-verified; treat the wall as a snapshot, not a live feed.';
    }
  }
  return artifact;
}

async function loadEstateWall() {
  try {
    const r = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching ' + DATA_URL);
    const envelope = await r.json();
    if (!envelope.artifact || !Array.isArray(envelope.artifact.records)) {
      throw new Error('estate wall data is malformed (no artifact.records)');
    }
    const artifact = render(envelope);
    browserDigest(artifact);
  } catch (e) {
    renderError('Estate Wall data unavailable: ' + e.message
      + ' — no estate status is shown rather than stale or invented status.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadEstateWall);
} else {
  loadEstateWall();
}
