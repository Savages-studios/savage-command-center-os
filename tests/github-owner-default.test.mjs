import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Pins the GITHUB_OWNER default (queue row D3): with GITHUB_OWNER unset,
// both copies of the intel handler must profile the estate owner's
// account, sa6ag9 — not any other identity. The public-boundary tests set
// GITHUB_OWNER explicitly, so the fallback itself needs its own pin.
// Same controlled-upstream pattern as github-intel-public.test.mjs: no
// external GitHub API access or private credentials are needed.
const entrypoints = ['api/github.js', 'artifacts/agent-shell/api/github.js'];

async function invokeWithOwnerUnset(file) {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.GITHUB_TOKEN;
  const oldOwner = process.env.GITHUB_OWNER;
  const oldRepo = process.env.GITHUB_REPO;
  const calls = [];
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok: false, status: 404, async json() { return { message: 'Not Found' }; } };
  };
  const response = {
    code: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; }
  };
  try {
    const moduleUrl = pathToFileURL(path.resolve(file)).href +
      '?isolated=' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const { default: handler } = await import(moduleUrl);
    await handler({ method: 'GET' }, response);
    return { response, calls };
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of [
      ['GITHUB_TOKEN', oldToken], ['GITHUB_OWNER', oldOwner], ['GITHUB_REPO', oldRepo]
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

for (const file of entrypoints) {
  test(file + ': owner defaults to sa6ag9 when GITHUB_OWNER is unset', async () => {
    const { response, calls } = await invokeWithOwnerUnset(file);
    assert.equal(response.code, 200);
    assert.ok(calls.length > 0, 'handler must make upstream calls');
    for (const url of calls) {
      assert.ok(url.includes('/sa6ag9'), 'expected sa6ag9 in upstream URL: ' + url);
      assert.ok(!url.includes('savagnic'), 'stale owner identity in upstream URL: ' + url);
    }
    assert.ok(
      calls.some(u => u.includes('/users/sa6ag9/repos?')),
      'expected a public-repos read for sa6ag9'
    );
  });
}
