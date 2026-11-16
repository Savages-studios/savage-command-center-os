#!/usr/bin/env node
// Refresh the Live Estate Wall data — verify first, publish second.
//
//   node scripts/refresh-estate-wall.mjs --attestation FILE
//       [--savage-standard DIR] [--out data/estate-wall.json] [--now ISO]
//
// Verification, in order (a failure at any step REFUSES: exit 1 and the
// output file is not written or modified):
//   1. Structural validation + summary/failures cross-check
//      (lib/estate-wall-core.mjs).
//   2. Digest recomputation: SHA-256 over the RFC 8785 JCS canonical form
//      of the artifact without its digest field, compared to the stored
//      digest. This catches the planted control — a flipped verdict with
//      nothing recomputed — and any other edit that leaves the digest stale.
//   3. When --savage-standard DIR is given: savage-standard's own
//      `estate --check` (full re-derivation of every record from the
//      embedded snapshot) run as a subprocess. This is the check that also
//      catches tampering whose digest was honestly recomputed. When the
//      flag is absent the step is recorded as not run — never implied.
//
// The published envelope states plainly that the attestation is UNSIGNED:
// the estate signing key is not yet minted, so the wall carries the digest
// and the verification record, and claims no signature.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WALL_KIND, canonicalCore, structuralProblems,
} from '../lib/estate-wall-core.mjs';

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function refuse(problems) {
  for (const p of problems) console.error('REFUSED: ' + p);
  console.error('refresh-estate-wall: attestation NOT published (output untouched)');
  process.exit(1);
}

const attestationPath = arg('attestation');
if (!attestationPath) {
  console.error('usage: node scripts/refresh-estate-wall.mjs --attestation FILE [--savage-standard DIR] [--out FILE] [--now ISO]');
  process.exit(2);
}
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = resolve(repoRoot, arg('out', 'data/estate-wall.json'));
const nowIso = arg('now', new Date().toISOString());

let artifact;
try {
  artifact = JSON.parse(readFileSync(attestationPath, 'utf8'));
} catch (e) {
  refuse([`cannot read/parse attestation ${attestationPath}: ${e.message}`]);
}

// 1 + 2: structure, cross-checks, digest.
const problems = structuralProblems(artifact);
let recomputed = null;
try {
  recomputed = sha256Hex(canonicalCore(artifact));
} catch (e) {
  problems.push('digest: canonicalization failed: ' + e.message);
}
const methods = ['structural-validation+summary-crosscheck'];
if (recomputed !== null) {
  methods.push('jcs-sha256-digest-recompute');
  if (recomputed !== artifact.digest) {
    problems.push(
      `digest: stored ${artifact.digest} does not match recomputed ${recomputed} `
      + '(SHA-256 over the JCS canonical form without the digest field)');
  }
}
if (problems.length) refuse(problems);

// 3: optional full re-derivation by savage-standard itself.
const standardDir = arg('savage-standard');
let externalCheck = 'not-run (no --savage-standard checkout provided)';
if (standardDir) {
  const run = spawnSync(
    'python3', ['-m', 'savage_standard.cli', 'estate', '--check', resolve(attestationPath)],
    { cwd: standardDir, env: { ...process.env, PYTHONPATH: standardDir }, encoding: 'utf8' },
  );
  const tail = ((run.stdout || '') + (run.stderr || '')).trim().split('\n').pop() || '';
  if (run.error || run.status !== 0) {
    refuse([`savage-standard estate --check failed (exit ${run.status}): ${tail}`]);
  }
  methods.push('savage-standard estate --check (full re-derivation from snapshot)');
  externalCheck = 'VERIFIED by savage-standard estate --check: ' + tail;
}

const envelope = {
  kind: WALL_KIND,
  signed: false,
  signature: null,
  signature_note:
    'Unsigned: the estate signing key is not yet minted. Integrity rests on the '
    + 'SHA-256 digest below and the verification record — no signature is claimed.',
  verification: {
    status: 'VERIFIED',
    methods,
    external_check: externalCheck,
    verified_at: nowIso,
    digest_recomputed: recomputed,
  },
  artifact,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(envelope, null, 1) + '\n');
console.log(
  `estate wall published: ${artifact.summary.repos_attested} repos, `
  + `attested ${artifact.taken_at}, digest ${artifact.digest}, `
  + `verified_at ${nowIso} -> ${outPath}`,
);
console.log('verification methods: ' + methods.join(' · '));
console.log('external check: ' + externalCheck);
