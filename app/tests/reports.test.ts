import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../worker/index';
import { openLocalDatabase } from '../scripts/local-database';
import type { Env } from '../worker/types';
import { reportsOpen } from '../worker/reports';

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
  assert.deepEqual(Object.keys(row!).sort(), ['content_version', 'created_at', 'dedupe_key', 'id', 'note', 'resolution', 'status', 'topic_id', 'type', 'updated_at']);
  assert.equal(row!.status, 'new');
  assert.match(String(row!.dedupe_key), /^[0-9a-f]{64}$/);
});

test('concurrent identical reports are atomically deduplicated without exposing the stored id', async () => {
  const { call, env } = setup();
  const responses = await Promise.all([call('/api/reports', submit(good)), call('/api/reports', submit(good))]);
  const bodies = await Promise.all(responses.map((response) => response.json() as Promise<Record<string, unknown>>));
  assert.equal(bodies.filter((body) => typeof body.id === 'string').length, 1);
  assert.equal(bodies.filter((body) => body.duplicate === true).length, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>())!.n, 1);
});

test('duplicate attempts still consume the report rate limit', async () => {
  const { call, env } = setup();
  const responses = [];
  for (let i = 0; i < 4; i++) responses.push(await call('/api/reports', submit(good)));
  const bodies = await Promise.all(responses.slice(0, 3).map((response) => response.json() as Promise<Record<string, unknown>>));
  assert.equal(bodies[0].ok, true);
  assert.equal(bodies[1].duplicate, true);
  assert.equal(bodies[2].duplicate, true);
  assert.equal(responses[3].status, 429);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>())!.n, 1);
});

test('dedupe normalizes NFKC, case, zero-width characters and whitespace but keeps raw note text', async () => {
  const { call, env } = setup();
  const first = await call('/api/reports', submit({ ...good, note: '政策ＡＢＣ\u200b  內容' }));
  const second = await call('/api/reports', submit({ ...good, note: '政策abc 內容' }));
  assert.equal((await first.json() as Record<string, unknown>).ok, true);
  assert.equal((await second.json() as Record<string, unknown>).duplicate, true);
  const row = await env.DB.prepare('SELECT note FROM reports').first<{ note: string }>();
  assert.equal(row!.note, '政策ＡＢＣ\u200b  內容');
});

test('same topic with different note content is accepted and resolved reports can be submitted again', async () => {
  const { call, env } = setup();
  const first = await call('/api/reports', submit({ ...good, note: '第一段需要補充數據' }));
  const { id } = await first.json() as { id: string };
  const second = await call('/api/reports', submit({ ...good, note: '第二段需要補充數據' }));
  assert.equal((await second.json() as Record<string, unknown>).duplicate, undefined);
  const done = await call(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }, { Authorization: `Bearer ${WRITE}` });
  assert.equal(done.status, 200);
  const third = await call('/api/reports', submit({ ...good, note: '第一段需要補充數據' }));
  assert.equal((await third.json() as Record<string, unknown>).duplicate, undefined);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>())!.n, 3);
});

test('deterministic spam signals are quarantined while ordinary policy criticism stays new', async () => {
  const { call, env } = setup();
  const spam = [
    { ...good, type: '其他', note: '好'.repeat(20) },
    { ...good, note: '請查看 https://a.example https://b.example https://c.example https://d.example' },
    { ...good, type: '其他', note: '<script>alert(1)</script>' },
  ];
  for (const body of spam) {
    const response = await call('/api/reports', submit(body));
    const result = await response.json() as { id: string };
    const row = await env.DB.prepare('SELECT status,resolution FROM reports WHERE id=?').bind(result.id).first<{ status: string; resolution: string }>();
    assert.equal(row!.status, 'quarantined');
    assert.match(row!.resolution, /^自動隔離：/);
  }
  const normalSetup = setup();
  const normal = await normalSetup.call('/api/reports', submit({ ...good, note: '我不同意這項政策，擔心會增加通勤負擔，請補充評估。' }));
  const { id } = await normal.json() as { id: string };
  const row = await normalSetup.env.DB.prepare('SELECT status,resolution FROM reports WHERE id=?').bind(id).first<{ status: string; resolution: string | null }>();
  assert.deepEqual({ status: row!.status, resolution: row!.resolution }, { status: 'new', resolution: null });
});

test('invalid topic IDs, types and overlong notes are rejected; honeypot posts are discarded silently', async () => {
  const { call, env } = setup();
  for (const bad of [{ ...good, topicId: 'x1' }, { ...good, topicId: 't999' }, { ...good, type: '亂寫' }, { ...good, note: '字'.repeat(301) }, { ...good, type: '其他', note: '' }]) {
    assert.ok((await call('/api/reports', submit(bad))).status >= 400);
  }
  const trap = await call('/api/reports', submit({ ...good, website: 'http://spam.example' }));
  assert.equal(trap.status, 201);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>())!.n, 0);
});

test('overlong report streams without Content-Length are cancelled at the 4KB limit', async () => {
  const { env } = setup();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(4097))); },
    cancel() { cancelled = true; },
  });
  const request = new Request('https://policy.example/api/reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream,
    duplex: 'half',
  } as RequestInit);
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
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
  for (let i = 0; i < 5; i++) codes.push((await call('/api/reports', submit({ ...good, note: `${good.note} ${i}` }))).status);
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

test('production reports require an explicit switch and dedicated validation settings', () => {
  const configured = { ENVIRONMENT: 'production', REPORTS_TURNSTILE_SITE_KEY: 'report-public-key', REPORTS_TURNSTILE_SECRET_KEY: 'report-test-secret', REPORTS_RATE_LIMIT_SALT: 'report-test-salt' } as Env;
  assert.equal(reportsOpen(configured), false);
  assert.equal(reportsOpen({ ...configured, REPORTS_ENABLED: 'true' }), true);
  assert.equal(reportsOpen({ ...configured, REPORTS_ENABLED: 'true', REPORTS_RATE_LIMIT_SALT: undefined }), false);
});

test('production validates the report action before storing and never exposes private settings', async () => {
  const { call, env } = setup({ ENVIRONMENT: 'production', REPORTS_ENABLED: 'true', REPORTS_TURNSTILE_SITE_KEY: 'report-public-key', REPORTS_TURNSTILE_SECRET_KEY: 'report-test-secret', REPORTS_RATE_LIMIT_SALT: 'report-test-salt', REPORTS_READ_TOKEN: undefined, REPORTS_WRITE_TOKEN: undefined });
  const config = await (await call('/api/config')).json() as Record<string, unknown>;
  assert.equal(config.reportsOpen, true);
  assert.equal(config.turnstileSiteKey, 'report-public-key');
  assert.doesNotMatch(JSON.stringify(config), /report-test-secret|report-test-salt/);
  assert.equal((await call('/api/reports', submit(good))).status, 403);
  assert.equal((await call('/api/admin/reports')).status, 404);
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.secret, 'report-test-secret');
      return Response.json({ success: true, hostname: 'policy.example', action: 'generate' });
    };
    assert.equal((await call('/api/reports', submit({ ...good, turnstileToken: 'test-token' }))).status, 403);
    globalThis.fetch = async () => Response.json({ success: true, hostname: 'policy.example', action: 'report' });
    const accepted = await call('/api/reports', submit({ ...good, turnstileToken: 'test-token' }));
    assert.equal(accepted.status, 201);
    const { id } = await accepted.json() as { id: string };
    const row = await env.DB.prepare('SELECT topic_id,note,status FROM reports WHERE id=?').bind(id).first();
    assert.deepEqual({ ...row }, { topic_id: good.topicId, note: good.note, status: 'new' });
  } finally { globalThis.fetch = previous; }
});

test('site reports canonicalize an existing topic page and store the server corpus version', async () => {
  const { call, env } = setup();
  const response = await call('/api/reports', submit({
    scope: 'site', pagePath: '/topics/t021/index.html', type: '版面顯示異常', note: '手機版主題頁的版面顯示不正確', contentVersion: 'attacker-version',
  }));
  assert.equal(response.status, 201);
  const { id } = await response.json() as { id: string };
  const row = await env.DB.prepare('SELECT topic_id,type,note,content_version,status FROM reports WHERE id=?').bind(id).first<Record<string, unknown>>();
  const current = await env.DB.prepare("SELECT value FROM topic_search_meta WHERE key='corpus_version'").first<{ value: string }>();
  assert.deepEqual({ ...row }, {
    topic_id: 'site:/topics/t021/', type: '版面顯示異常', note: '手機版主題頁的版面顯示不正確', content_version: current!.value, status: 'new',
  });
});

test('site reports accept fixed types and reject unsafe, unknown or non-existent page paths', async () => {
  const { call, env } = setup();
  const valid = { scope: 'site', pagePath: '/', type: '其他', note: '首頁的這個問題需要說明' };
  const invalid = [
    { ...valid, pagePath: '/index.html?next=/admin' },
    { ...valid, pagePath: 'https://puma.taipei/' },
    { ...valid, pagePath: '/api/config' },
    { ...valid, pagePath: '/admin/' },
    { ...valid, pagePath: '/topics/t999/' },
    { ...valid, pagePath: '/topics/t021/extra' },
    { ...valid, pagePath: '/topics/t21/' },
    { ...valid, scope: 'campaign' },
    { ...valid, type: '與原文意思不符' },
    { ...valid, note: '三字' },
  ];
  for (const body of invalid) assert.ok((await call('/api/reports', submit(body))).status >= 400, JSON.stringify(body));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>())!.n, 0);
});

test('site reports sharing a normalized page and note are atomically deduplicated', async () => {
  const { call, env } = setup();
  const body = { scope: 'site', pagePath: '/topics/index.html', type: '搜尋找不到或結果不正確', note: '搜尋結果沒有顯示相關主題' };
  const responses = await Promise.all([call('/api/reports', submit(body)), call('/api/reports', submit({ ...body, pagePath: '/topics/' }))]);
  const bodies = await Promise.all(responses.map((response) => response.json() as Promise<Record<string, unknown>>));
  assert.equal(bodies.filter((item) => typeof item.id === 'string').length, 1);
  assert.equal(bodies.filter((item) => item.duplicate === true).length, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>())!.n, 1);
  assert.equal((await env.DB.prepare('SELECT topic_id FROM reports').first<{ topic_id: string }>())!.topic_id, 'site:/topics/');
});

test('site and topic reports share the existing report rate limit', async () => {
  const { call } = setup();
  for (let i = 0; i < 3; i++) {
    const response = await call('/api/reports', submit({ scope: 'site', pagePath: '/', type: '版面顯示異常', note: `首頁版面問題 ${i}` }));
    assert.equal(response.status, 201);
  }
  assert.equal((await call('/api/reports', submit(good))).status, 429);
});

test('site spam is quarantined while ordinary criticism is accepted', async () => {
  const { call, env } = setup();
  const spam = await call('/api/reports', submit({ scope: 'site', pagePath: '/', type: '其他', note: '好'.repeat(20) }));
  assert.equal(spam.status, 201);
  const spamResult = await spam.json() as { id: string };
  const spamRow = await env.DB.prepare('SELECT status,resolution FROM reports WHERE id=?').bind(spamResult.id).first<{ status: string; resolution: string }>();
  assert.equal(spamRow!.status, 'quarantined');
  assert.match(spamRow!.resolution, /^自動隔離：/);

  const normal = await call('/api/reports', submit({ scope: 'site', pagePath: '/', type: '其他', note: '我不同意這個網站的說明方式，請補充操作步驟。' }));
  assert.equal(normal.status, 201);
  const normalResult = await normal.json() as { id: string };
  const normalRow = await env.DB.prepare('SELECT status,resolution FROM reports WHERE id=?').bind(normalResult.id).first<{ status: string; resolution: string | null }>();
  assert.deepEqual({ status: normalRow!.status, resolution: normalRow!.resolution }, { status: 'new', resolution: null });
});

test('failed Turnstile verification for a site report never inserts a row', async () => {
  const { call, env } = setup({ ENVIRONMENT: 'production', REPORTS_ENABLED: 'true', REPORTS_TURNSTILE_SITE_KEY: 'report-public-key', REPORTS_TURNSTILE_SECRET_KEY: 'report-test-secret', REPORTS_RATE_LIMIT_SALT: 'report-test-salt' });
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ success: false, hostname: 'policy.example', action: 'report' });
    const response = await call('/api/reports', submit({ scope: 'site', pagePath: '/', type: '版面顯示異常', note: '首頁版面顯示不正確', turnstileToken: 'expired-token' }));
    assert.equal(response.status, 403);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>())!.n, 0);
  } finally { globalThis.fetch = previous; }
});
