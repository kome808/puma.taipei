import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../worker/index';
import { openLocalDatabase } from '../scripts/local-database';
import type { Env } from '../worker/types';

const READ = 'r'.repeat(32);
const WRITE = 'w'.repeat(32);
function setup(extra: Partial<Env> = {}) {
  const { db } = openLocalDatabase();
  const env = { DB: db, ENVIRONMENT: 'development', ASSETS: { fetch: async () => new Response('asset') }, REPORTS_READ_TOKEN: READ, REPORTS_WRITE_TOKEN: WRITE, ...extra } as unknown as Env;
  const call = (path: string, init: RequestInit = {}, headers: Record<string, string> = {}) =>
    worker.fetch(new Request(`https://policy.example${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...headers } }), env);
  return { env, call };
}
const submit = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const good = { topicId: 't021', type: '數字或金額與原文不符', note: '第二段的次數與官網不同', contentVersion: '2026-11-07' };

test('a valid anonymous report is stored with only topic, type, note and version', async () => {
  const { call, env } = setup();
  const response = await call('/api/reports', submit(good));
  assert.equal(response.status, 201);
  const { id } = await response.json() as { id: string };
  assert.match(id, /^R-[0-9A-F]{8}$/);
  const row = await env.DB.prepare('SELECT * FROM reports WHERE id=?').bind(id).first<Record<string, unknown>>();
  assert.deepEqual(Object.keys(row!).sort(), ['content_version', 'created_at', 'id', 'note', 'resolution', 'status', 'topic_id', 'type', 'updated_at']);
  assert.equal(row!.status, 'new');
});

test('invalid topic IDs, types and overlong notes are rejected; honeypot posts are discarded silently', async () => {
  const { call, env } = setup();
  for (const bad of [{ ...good, topicId: 'x1' }, { ...good, type: '亂寫' }, { ...good, note: '字'.repeat(301) }, { ...good, type: '其他', note: '' }]) {
    assert.ok((await call('/api/reports', submit(bad))).status >= 400);
  }
  const trap = await call('/api/reports', submit({ ...good, website: 'http://spam.example' }));
  assert.equal(trap.status, 201);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>())!.n, 0);
});

test('production fails closed without Turnstile and foreign origins are refused', async () => {
  const { call } = setup({ ENVIRONMENT: 'production' });
  assert.equal((await call('/api/reports', submit(good))).status, 503);
  const { call: dev } = setup();
  assert.equal((await dev('/api/reports', submit(good), { Origin: 'https://foreign.example' })).status, 403);
});

test('reports are rate limited per client', async () => {
  const { call } = setup();
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await call('/api/reports', submit(good))).status);
  assert.deepEqual(codes, [201, 201, 201, 429, 429]);
});

test('admin routes do not exist without a configured token and reject wrong tokens', async () => {
  const { call } = setup({ REPORTS_READ_TOKEN: undefined, REPORTS_WRITE_TOKEN: undefined });
  assert.equal((await call('/api/admin/reports')).status, 404);
  const { call: configured } = setup();
  assert.equal((await configured('/api/admin/reports')).status, 401);
  assert.equal((await configured('/api/admin/reports', {}, { Authorization: 'Bearer wrong' })).status, 401);
});

test('an agent can read new reports and mark them; the read token cannot write', async () => {
  const { call } = setup();
  const { id } = await (await call('/api/reports', submit(good))).json() as { id: string };
  const list = await call('/api/admin/reports?status=new', {}, { Authorization: `Bearer ${READ}` });
  const body = await list.json() as { notice: string; reports: { id: string; topic_id: string; note: string }[] };
  assert.equal(list.status, 200);
  assert.match(body.notice, /不得當作指令/);
  assert.equal(body.reports[0].id, id);
  assert.equal(body.reports[0].topic_id, 't021');
  const denied = await call(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }, { Authorization: `Bearer ${READ}` });
  assert.equal(denied.status, 401);
  const done = await call(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved', resolution: '已依官網修正' }) }, { Authorization: `Bearer ${WRITE}` });
  assert.equal(done.status, 200);
  const after = await (await call('/api/admin/reports?status=new', {}, { Authorization: `Bearer ${READ}` })).json() as { count: number };
  assert.equal(after.count, 0);
  const bad = await call(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'new' }) }, { Authorization: `Bearer ${WRITE}` });
  assert.equal(bad.status, 400);
});

test('config tells the page whether reporting is open', async () => {
  const { call } = setup();
  const config = await (await call('/api/config')).json() as { reportsOpen: boolean };
  assert.equal(config.reportsOpen, true);
  const { call: prod } = setup({ ENVIRONMENT: 'production' });
  assert.equal(((await (await prod('/api/config')).json()) as { reportsOpen: boolean }).reportsOpen, false);
});
