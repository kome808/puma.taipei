import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index';
import type { Env } from '../worker/types';

function noBackendEnv() {
  return {
    OPENAI_API_KEY: 'present-but-unused',
    AI_SEARCH: { search: async () => { throw new Error('AI_SEARCH must not be touched'); } },
    DB: { prepare: () => { throw new Error('DB must not be touched'); } },
    ASSETS: { fetch: async () => new Response('asset') },
  } as unknown as Env;
}

test('legacy generation and search APIs are retired for every method without backend access', async () => {
  for (const path of ['/api/generate', '/api/search']) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const response = await worker.fetch(new Request(`https://policy.example${path}`, { method }), noBackendEnv());
      assert.equal(response.status, 410, `${method} ${path}`);
      const body = await response.json() as { error: { code: string; href: string } };
      assert.equal(body.error.code, 'FEATURE_RETIRED');
      assert.equal(body.error.href, '/topics/');
    }
  }
});

test('config and health describe static mode without DB, AI Search, or Turnstile dependencies', async () => {
  const env = noBackendEnv();
  for (const path of ['/api/config', '/api/health']) {
    const response = await worker.fetch(new Request(`https://policy.example${path}`), env);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.mode, 'static-topic-search');
    assert.equal(body.generationEnabled, false);
    if (path.endsWith('config')) {
      assert.equal(body.live, false);
      assert.equal('turnstileSiteKey' in body, false);
    }
  }
});

test('API responses retain security headers and unknown API routes stay 404', async () => {
  const env = noBackendEnv();
  const retired = await worker.fetch(new Request('https://policy.example/api/generate', { method: 'POST' }), env);
  assert.equal(retired.headers.get('Content-Security-Policy')?.includes("default-src 'self'"), true);
  assert.equal(retired.headers.get('X-Content-Type-Options'), 'nosniff');
  const missing = await worker.fetch(new Request('https://policy.example/api/unknown'), env);
  assert.equal(missing.status, 404);
});
