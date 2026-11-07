import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index';
import type { Env } from '../worker/types';

test('root and legacy index redirect to the static topic page while preserving useful filters only', async () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') } } as unknown as Env;
  const response = await worker.fetch(new Request('https://policy.example/?q=%20長照%20&group=g12&topic=t004&mode=share&junk=x'), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/topics/?q=%E9%95%B7%E7%85%A7&group=g12&topic=t004');
  const legacy = await worker.fetch(new Request('https://policy.example/index.html?mode=share'), env);
  assert.equal(legacy.headers.get('Location'), '/topics/');
  const head = await worker.fetch(new Request('https://policy.example/', { method: 'HEAD' }), env);
  assert.equal(head.status, 302);
  assert.equal(await head.text(), '');
});

test('non-entry static paths pass through to ASSETS and receive security headers', async () => {
  let seen: Request | undefined;
  const env = { ASSETS: { fetch: async (request: Request) => { seen = request; return new Response('static body', { headers: { 'Content-Type': 'text/html' } }); } } } as unknown as Env;
  const response = await worker.fetch(new Request('https://policy.example/topics/'), env);
  assert.equal(seen?.url, 'https://policy.example/topics/');
  assert.equal(await response.text(), 'static body');
  assert.equal(response.headers.get('Content-Security-Policy')?.includes("default-src 'self'"), true);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
});

test('static asset failures return bounded 503 JSON with security headers', async () => {
  const env = { ASSETS: { fetch: async () => { throw new Error('private origin details'); } } } as unknown as Env;
  const response = await worker.fetch(new Request('https://policy.example/topics/'), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Content-Security-Policy')?.includes("default-src 'self'"), true);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'SERVICE_ERROR');
  assert.equal(body.error.message.includes('private origin details'), false);
});
