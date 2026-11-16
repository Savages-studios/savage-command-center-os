// Estate Wall controls — Node stdlib test runner, zero new dependencies.
// Run: npm run test:estate-wall   (node --test tests/estate-wall.test.mjs)
//
// Controls proven here:
//   1. The shipped data file is a verified envelope whose artifact digest
//      recomputes (JCS + SHA-256) and whose records are structurally sound.
//   2. TAMPER: flipping one repo's GT verdict in a copy of the real
//      artifact (recomputing nothing) is refused by the refresh script —
//      non-zero exit, output untouched.
//   3. STALENESS: an artifact attested >24h ago is stale; the shipped one
//      (attested <24h before its verified_at) was fresh at publish time,
//      and isStale flips exactly at the 24h boundary.
//   4. RENDER: the row renderer emits one row per record in the shipped
//      artifact, carrying the repo name, GT verdict, CI state and the
//      claims-gated marker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalCore, structuralProblems, isStale, rowHtml, claimsMarker, STALE_AFTER_MS,
} from '../lib/estate-wall-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envelope = JSON.parse(readFileSync(join(root, 'data/estate-wall.json'), 'utf8'));
const artifact = envelope.artifact;
const sha256Hex = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

test('shipped envelope: verified, unsigned, digest recomputes', () => {
  assert.equal(envelope.kind, 'savage.estate_wall.v1');
  assert.equal(envelope.signed, false);
  assert.equal(envelope.signature, null);
  assert.equal(envelope.verification.status, 'VERIFIED');
  assert.ok(envelope.verification.methods.includes('jcs-sha256-digest-recompute'));
  assert.deepEqual(structuralProblems(artifact), []);
  assert.equal(sha256Hex(canonicalCore(artifact)), artifact.digest);
  assert.equal(envelope.verification.digest_recomputed, artifact.digest);
});

test('render: one row per record, with verdict, CI state and gated marker', () => {
  assert.ok(artifact.records.length > 0);
  const rows = artifact.records.map(rowHtml);
  assert.equal(rows.length, artifact.records.length);
  rows.forEach((html, i) => {
    const r = artifact.records[i];
    assert.ok(html.includes(r.repo), 'row names the repo');
    assert.ok(html.includes(r.gt.currency), 'row shows GT verdict');
    assert.ok(html.includes(r.ci.state), 'row shows CI state');
    assert.equal(html.includes('GATED'), r.claims.some((c) => c.gated),
      'gated marker present exactly when a claim is gated');
  });
  const gated = artifact.records.filter((r) => r.claims.some((c) => c.gated));
  assert.ok(gated.length >= 1, 'the real artifact has at least one gated repo');
  assert.ok(claimsMarker(gated[0]).includes('GATED'));
});

test('staleness: >24h old is stale, boundary is exact', () => {
  const t0 = Date.parse(artifact.taken_at);
  assert.equal(isStale(artifact.taken_at, t0 + STALE_AFTER_MS - 1), false);
  assert.equal(isStale(artifact.taken_at, t0 + STALE_AFTER_MS + 1), true);
  // A backdated copy (>24h before its own publish time) reads stale.
  const backdated = new Date(t0 - 25 * 3600 * 1000).toISOString();
  assert.equal(isStale(backdated, t0), true);
  // The shipped artifact was fresh when the refresh verified it.
  const verifiedAt = Date.parse(envelope.verification.verified_at);
  assert.equal(isStale(artifact.taken_at, verifiedAt), false,
    'shipped artifact must have been <=24h old at publish time');
});

test('tamper control: flipped verdict, nothing recomputed — refresh refuses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'estate-wall-tamper-'));
  const tampered = JSON.parse(JSON.stringify(artifact));
  const rec = tampered.records.find((r) => r.gt.currency !== 'CURRENT')
    || tampered.records[0];
  rec.gt.currency = 'CURRENT'; // the lie: claim currency that was not attested
  const attPath = join(dir, 'tampered.json');
  const outPath = join(dir, 'out.json');
  writeFileSync(attPath, JSON.stringify(tampered));
  const run = spawnSync('node',
    [join(root, 'scripts/refresh-estate-wall.mjs'),
      '--attestation', attPath, '--out', outPath],
    { encoding: 'utf8' });
  assert.notEqual(run.status, 0, 'refresh must exit non-zero on a tampered artifact');
  assert.match(run.stderr, /digest/, 'refusal names the digest mismatch');
  assert.equal(existsSync(outPath), false, 'tampered artifact is never published');
});

test('refresh control: the genuine artifact is accepted and republished intact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'estate-wall-genuine-'));
  const attPath = join(dir, 'attestation.json');
  const outPath = join(dir, 'out.json');
  writeFileSync(attPath, JSON.stringify(artifact));
  const before = existsSync(outPath) ? statSync(outPath).mtimeMs : 0;
  assert.equal(before, 0);
  const run = spawnSync('node',
    [join(root, 'scripts/refresh-estate-wall.mjs'),
      '--attestation', attPath, '--out', outPath,
      '--now', envelope.verification.verified_at],
    { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(readFileSync(outPath, 'utf8'));
  assert.equal(out.artifact.digest, artifact.digest);
  assert.equal(out.artifact.records.length, artifact.records.length);
  assert.equal(out.verification.status, 'VERIFIED');
});
