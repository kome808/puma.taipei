import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { openLocalDatabase } from '../scripts/local-database';
import { fulltextTopicSearch, reserveSemanticSearch, semanticTopicSearch } from '../worker/topic-retrieval';
import type { Env } from '../worker/types';
import manifest from '../shared/topic-search-manifest.json' with { type: 'json' };

const database = openLocalDatabase();
after(() => database.close());

function request(query = '都更停滯如何退場', corpusVersion = manifest.corpusVersion) {
  return new Request('https://policy.example/api/topic-search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://policy.example', 'cf-connecting-ip': '203.0.113.7' },
    body: JSON.stringify({ query, corpusVersion }),
  });
}

function semanticEnv(search: (input: Record<string, unknown>) => Promise<{ chunks: Array<{ score: number; text: string; item: { key: string } }> }> = async () => ({ chunks: [] })) {
  return {
    DB: database.db,
    SEMANTIC_SEARCH_ENABLED: 'true',
    SEMANTIC_SEARCH: { search },
    RATE_LIMIT_SALT: 'internal-test-salt-32-characters-long',
  } as unknown as Env;
}

async function usage(env: Env, now = new Date('2026-11-07T12:00:00.000Z')) {
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  return env.DB.prepare('SELECT count FROM semantic_search_usage WHERE period = ?').bind(period).first<{ count: number }>();
}

async function clearUsage() {
  await database.db.prepare('DELETE FROM semantic_search_usage').run();
  await database.db.prepare('DELETE FROM request_limits').run();
}

test('quota is capped at exactly 1000 across parallel reservations and persists across calls', async () => {
  await clearUsage();
  const env = semanticEnv();
  const now = new Date('2026-11-07T12:00:00.000Z');
  const reservations = await Promise.all(Array.from({ length: 1020 }, () => reserveSemanticSearch(env, now).then(() => true, () => false)));
  assert.equal(reservations.filter(Boolean).length, 1000);
  assert.equal(reservations.filter((reserved) => !reserved).length, 20);
  assert.equal((await usage(env, now))?.count, 1000);
  assert.deepEqual(await reserveSemanticSearch(env, now).catch((error: { code?: string }) => error.code), 'SEMANTIC_QUOTA_EXHAUSTED');
});

test('the exhausted semantic quota rejects before calling the provider', async () => {
  await clearUsage();
  const env = semanticEnv();
  const now = new Date('2026-11-07T12:00:00.000Z');
  for (let i = 0; i < 1000; i++) await reserveSemanticSearch(env, now);
  let calls = 0;
  const exhaustedEnv = semanticEnv(async () => { calls++; return { chunks: [] }; });
  await assert.rejects(semanticTopicSearch(request(), exhaustedEnv, now), (error: { code?: string; status?: number }) => error.code === 'SEMANTIC_QUOTA_EXHAUSTED' && error.status === 429);
  assert.equal(calls, 0);
});

test('UTC reset periods roll over at the configured period boundary', async () => {
  await clearUsage();
  const env = semanticEnv();
  const before = new Date('2026-11-30T23:59:59.999Z');
  const afterBoundary = new Date('2026-12-01T00:00:00.000Z');
  assert.equal((await reserveSemanticSearch(env, before)).used, 1);
  const next = await reserveSemanticSearch(env, afterBoundary);
  assert.equal(next.used, 1);
  assert.equal(next.remaining, 999);
});

test('reset day 31 clamps to February 28 and resumes on March 31', async () => {
  await clearUsage();
  const env = { ...semanticEnv(), SEMANTIC_QUOTA_RESET_DAY: '31' } as Env;
  const february = await reserveSemanticSearch(env, new Date('2027-02-28T00:00:00.000Z'));
  assert.equal(february.used, 1);
  assert.equal(february.resetsAt, '2027-03-31T00:00:00.000Z');
  const march = await reserveSemanticSearch(env, new Date('2027-03-31T00:00:00.000Z'));
  assert.equal(march.used, 1);
  assert.equal(march.resetsAt, '2027-04-30T00:00:00.000Z');
  const februaryRow = await database.db.prepare("SELECT count FROM semantic_search_usage WHERE period='2027-02-28'").first<{ count: number }>();
  const marchRow = await database.db.prepare("SELECT count FROM semantic_search_usage WHERE period='2027-03-31'").first<{ count: number }>();
  assert.equal(februaryRow?.count, 1);
  assert.equal(marchRow?.count, 1);
});

test('invalid configured reset day fails closed without writing quota usage', async () => {
  await clearUsage();
  const env = { ...semanticEnv(), SEMANTIC_QUOTA_RESET_DAY: '32' } as Env;
  await assert.rejects(reserveSemanticSearch(env, new Date('2027-02-10T00:00:00.000Z')), (error: { code?: string; status?: number }) => error.code === 'SEMANTIC_UNAVAILABLE' && error.status === 503);
  const rows = await database.db.prepare('SELECT count FROM semantic_search_usage').all<{ count: number }>();
  assert.equal(rows.results.length, 0);
});

test('provider failure consumes its reservation and is not retried', async () => {
  await clearUsage();
  let calls = 0;
  const env = semanticEnv(async () => { calls++; throw new Error('provider unavailable'); });
  const now = new Date('2026-11-07T12:00:00.000Z');
  await assert.rejects(semanticTopicSearch(request(), env, now));
  assert.equal(calls, 1);
  assert.equal((await usage(env, now))?.count, 1);
});

test('validation and missing semantic configuration fail before quota reservation or upstream calls', async () => {
  await clearUsage();
  const now = new Date('2026-11-07T12:00:00.000Z');
  let calls = 0;
  const env = semanticEnv(async () => { calls++; return { chunks: [] }; });
  await assert.rejects(semanticTopicSearch(request('   '), env, now));
  await assert.rejects(semanticTopicSearch(request('都更', 'stale-corpus'), env, now));
  await assert.rejects(semanticTopicSearch(request(), { ...env, SEMANTIC_SEARCH_ENABLED: 'false' } as Env, now));
  await assert.rejects(semanticTopicSearch(request(), { ...env, SEMANTIC_SEARCH: undefined } as Env, now));
  assert.equal(calls, 0);
  assert.equal(await usage(env, now), null);
});

test('a database/index failure is fail closed and never calls the semantic provider', async () => {
  await clearUsage();
  let calls = 0;
  const env = semanticEnv(async () => { calls++; return { chunks: [] }; });
  const broken = { ...env, DB: { prepare() { throw new Error('database unavailable'); }, batch: async () => [] } } as unknown as Env;
  await assert.rejects(semanticTopicSearch(request(), broken, new Date('2026-11-07T12:00:00.000Z')));
  await assert.rejects(fulltextTopicSearch(request(), broken));
  assert.equal(calls, 0);
  assert.equal(await usage(env), null);
});

test('semantic results map only current manifest keys, deduplicate IDs, preserve score order, and never return chunk text', async () => {
  await clearUsage();
  const now = new Date('2026-11-07T12:00:00.000Z');
  const env = semanticEnv(async () => ({ chunks: [
    { score: 0.92, text: 'secret provider payload', item: { key: `${manifest.prefix}/t028.md` } },
    { score: 0.91, text: 'duplicate result', item: { key: `${manifest.prefix}/t028.md` } },
    { score: 0.88, text: 'untrusted unknown result', item: { key: `${manifest.prefix}/t999.md` } },
    { score: 0.85, text: 'stale namespace result', item: { key: `old-prefix/t001.md` } },
    { score: 0.81, text: 'another current result', item: { key: `${manifest.prefix}/t060.md` } },
  ] }));
  const result = await semanticTopicSearch(request('肌力和 AI 教練'), env, now) as Record<string, unknown>;
  assert.equal(result.mode, 'semantic-topic-search');
  assert.equal(result.corpusVersion, manifest.corpusVersion);
  assert.deepEqual(result.topicIds, ['t028', 't060']);
  assert.equal(JSON.stringify(result).includes('secret provider payload'), false);
  assert.equal(JSON.stringify(result).includes('untrusted unknown result'), false);
});

test('semantic provider uses bounded hybrid retrieval with rewriting and cache disabled in the current folder', async () => {
  await clearUsage();
  let captured: Record<string, any> | undefined;
  const env = semanticEnv(async (input) => {
    captured = input;
    return { chunks: [{ score: 0.9, text: 'ignored provider text', item: { key: `${manifest.prefix}/t028.md` } }] };
  });
  const result = await semanticTopicSearch(request('銀髮族肌肉流失'), env, new Date('2026-11-07T12:00:00.000Z')) as Record<string, unknown>;
  assert.deepEqual(result.topicIds, ['t028']);
  assert.ok(captured);
  assert.equal(captured.ai_search_options.retrieval.retrieval_type, 'hybrid');
  assert.equal(captured.ai_search_options.retrieval.filters.folder, `${manifest.prefix}/`);
  assert.equal(captured.ai_search_options.query_rewrite.enabled, false);
  assert.equal(captured.ai_search_options.cache.enabled, false);
});

test('unknown-only and stale-folder semantic chunks fail unavailable while keeping their reservations', async () => {
  await clearUsage();
  const cases = [
    { score: 0.9, text: 'untrusted unknown topic', item: { key: `${manifest.prefix}/t999.md` } },
    { score: 0.9, text: 'untrusted stale topic', item: { key: `stale-folder/t028.md` } },
  ];
  const env = semanticEnv(async () => ({ chunks: [cases.shift()!] }));
  const now = new Date('2026-11-07T12:00:00.000Z');
  for (let i = 0; i < 2; i++) {
    await assert.rejects(semanticTopicSearch(request('政策搜尋'), env, now), (error: { code?: string; status?: number }) => error.code === 'SEMANTIC_UNAVAILABLE' && error.status === 503);
  }
  assert.equal((await usage(env, now))?.count, 2);
});

test('one client is limited to five semantic searches per minute without blocking basic search', async () => {
  await clearUsage();
  let calls = 0;
  const env = semanticEnv(async () => {
    calls++;
    return { chunks: [{ score: 0.9, text: 'ignored text', item: { key: `${manifest.prefix}/t028.md` } }] };
  });
  const now = new Date('2026-11-07T12:00:00.000Z');
  for (let i = 0; i < 5; i++) {
    const result = await semanticTopicSearch(request('銀髮族肌肉流失'), env, now) as { topicIds: string[] };
    assert.deepEqual(result.topicIds, ['t028']);
  }
  await assert.rejects(
    semanticTopicSearch(request('銀髮族肌肉流失'), env, now),
    (error: { code?: string; status?: number }) => error.code === 'SEMANTIC_RATE_LIMITED' && error.status === 429,
  );
  assert.equal(calls, 5);
  assert.equal((await usage(env, now))?.count, 5, 'the rate-limited sixth call must not reserve global quota');
  const basic = await fulltextTopicSearch(request('銀髮族肌肉流失'), env);
  assert.ok((basic as { topicIds: string[] }).topicIds.includes('t028'));
});

test('full text topic search remains available when the semantic quota is exhausted', async () => {
  await clearUsage();
  const env = semanticEnv();
  const now = new Date('2026-11-07T12:00:00.000Z');
  for (let i = 0; i < 1000; i++) await reserveSemanticSearch(env, now);
  const result = await fulltextTopicSearch(request('肌力'), env) as Record<string, unknown>;
  assert.equal(result.mode, 'fulltext-topic-search');
  assert.equal(result.corpusVersion, manifest.corpusVersion);
  assert.ok(Array.isArray(result.topicIds));
  assert.ok((result.topicIds as string[]).includes('t028'));
});

test('basic D1 topic search returns the expected gold topics without mixing AI-coach and exercise results', async () => {
  const gold = [
    ['無限都更一開始的房子要怎樣來', 't065'],
    ['銀髮族肌肉流失可以做什麼', 't028'],
    ['老師行政工作太多怎麼辦', 't007'],
    ['臨時沒人幫忙帶小孩', 't013'],
    ['AI教練如何協助傳統產業', 't060'],
  ] as const;
  for (const [query, expectedId] of gold) {
    const result = await fulltextTopicSearch(request(query), semanticEnv()) as { topicIds: string[] };
    assert.equal(result.topicIds[0], expectedId, `expected ${expectedId} first for: ${query}`);
    if (expectedId === 't028') assert.ok(!result.topicIds.includes('t060'), 'exercise query must not retrieve AI industry-coach topic');
    if (expectedId === 't060') assert.ok(!result.topicIds.includes('t028'), 'AI industry-coach query must not retrieve exercise topic');
  }
});
