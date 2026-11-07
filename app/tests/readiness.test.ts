import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index';
import type { Env } from '../worker/types';

test('unverified generation requests do not consume formal generation quota', async () => {
  let writes = 0;
  const statement = { bind: () => statement, first: async () => { writes++; return { count: 1 }; }, all: async () => ({ results: [] }), run: async () => undefined };
  const env = { DB: { prepare: () => statement }, OPENAI_API_KEY: 'test-key', ENVIRONMENT: 'production', TURNSTILE_SITE_KEY: 'test-public', TURNSTILE_SECRET_KEY: 'test-secret', RATE_LIMIT_SALT: 'test-salt' } as unknown as Env;
  const request = new Request('https://policy.example/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '都更政策', mode: 'share' }) });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 403);
  assert.equal(writes, 0);
});

test('production config cannot report generation ready without a public Turnstile key', async () => {
  const statement = { all: async () => ({ results: [{ key: 'version', value: '2026-11-06-v1' }, { key: 'sources', value: '98' }, { key: 'passages', value: '1561' }] }) };
  const env = { DB: { prepare: () => statement }, OPENAI_API_KEY: 'test-key', ENVIRONMENT: 'production', TURNSTILE_SECRET_KEY: 'test-secret', RATE_LIMIT_SALT: 'test-salt' } as unknown as Env;
  const response = await worker.fetch(new Request('https://policy.example/api/config'), env);
  assert.equal((await response.json() as { live: boolean }).live, false);
});

test('empty corpus does not masquerade as a healthy dated snapshot', async () => {
  const env = { DB: { prepare: () => ({ all: async () => ({ results: [] }) }) } } as unknown as Env;
  const response = await worker.fetch(new Request('https://policy.example/api/health'), env);
  assert.equal(response.status, 503);
  const body = await response.json() as { ok: boolean; stats: { version: string } };
  assert.equal(body.ok, false);
  assert.equal(body.stats.version, '');
});
