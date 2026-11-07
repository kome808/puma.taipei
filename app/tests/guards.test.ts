import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInput, checkOrigin, verifyTurnstile } from '../worker/guards';
import type { Env } from '../worker/types';

const request = (body: unknown) => new Request('https://policy.example/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('only the two supported tasks are accepted', async () => {
  const input = await readInput(request({ query: ' 都更怎麼做？ ', mode: 'reply' }));
  assert.equal(input.query, '都更怎麼做？');
  assert.equal(input.mode, 'reply');
  await assert.rejects(readInput(request({ query: '都更政策', mode: 'admin' })));
});

test('large and malformed payloads are rejected before searching or generating', async () => {
  await assert.rejects(readInput(request({ query: '文'.repeat(6000), mode: 'share' })), /長/);
  await assert.rejects(readInput(request(null)), /格式/);
  await assert.rejects(readInput(request({ query: '', mode: 'share' })), /至少/);
});

test('foreign-origin requests cannot use same-origin API', () => {
  assert.throws(() => checkOrigin(new Request('https://policy.example/api/generate', { headers: { Origin: 'https://foreign.example' } }), {} as Env), /本網站/);
  assert.doesNotThrow(() => checkOrigin(new Request('https://policy.example/api/generate', { headers: { Origin: 'https://policy.example' } }), {} as Env));
});

test('production generation fails closed without Turnstile configuration', async () => {
  await assert.rejects(verifyTurnstile(request({}), { ENVIRONMENT: 'production' } as Env, ''), /設定/);
  await assert.rejects(verifyTurnstile(request({}), { ENVIRONMENT: 'production', TURNSTILE_SITE_KEY: 'public', TURNSTILE_SECRET_KEY: 'test-secret' } as Env, ''), /驗證/);
});
