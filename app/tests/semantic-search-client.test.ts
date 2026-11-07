import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemanticSearchResponse, requestBasicSearch, requestSemanticSearch, SemanticSearchError } from '../public/topics/semantic-search-client.mjs';

const result = {
  mode: 'semantic-topic-search', topicIds: ['t001', 't002'], corpusVersion: 'v7',
  quota: { limit: 1000, used: 12, remaining: 988, resetsAt: '2026-12-01T00:00:00Z' },
};
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });

test('parses valid semantic response and rejects malformed responses', () => {
  assert.deepEqual(parseSemanticSearchResponse(result), result);
  assert.throws(() => parseSemanticSearchResponse({ ...result, quota: undefined }), SemanticSearchError);
  assert.throws(() => parseSemanticSearchResponse({ ...result, topicIds: [3] }), SemanticSearchError);
  assert.throws(() => parseSemanticSearchResponse({ ...result, quota: { ...result.quota, limit: 999 } }), SemanticSearchError);
  assert.throws(() => parseSemanticSearchResponse({ ...result, quota: { ...result.quota, used: 0 } }), SemanticSearchError);
  assert.throws(() => parseSemanticSearchResponse({ ...result, quota: { ...result.quota, remaining: 987 } }), SemanticSearchError);
});

test('semantic request posts only query and corpus version and parses result', async () => {
  let request;
  const found = await requestSemanticSearch('育兒如何申請', 'v7', { fetchImpl: async (url, options) => {
    request = { url, options }; return response(result);
  } });
  assert.equal(request.url, '/api/semantic-search');
  assert.deepEqual(JSON.parse(request.options.body), { query: '育兒如何申請', corpusVersion: 'v7' });
  assert.deepEqual(found, result);
});

test('maps quota, unavailable, and corpus mismatch errors to actionable messages', async () => {
  for (const [status, code, expected] of [
    [429, 'SEMANTIC_QUOTA_EXHAUSTED', '語意搜尋本月額度已用完，目前無法提供服務。你仍可使用基本搜尋。'],
    [429, 'SEMANTIC_RATE_LIMITED', '查詢稍微密集，請稍後再試。基本搜尋仍可使用。'],
    [503, 'SEMANTIC_UNAVAILABLE', '語意搜尋目前無法使用，你仍可使用基本搜尋。'],
    [409, 'SEMANTIC_CORPUS_MISMATCH', '主題資料版本已更新，請重新整理頁面後再試。'],
  ] as const) {
    await assert.rejects(requestSemanticSearch('問題', 'v7', { fetchImpl: async () => response({ error: { code, message: 'backend detail' } }, status) }), (error: any) => {
      assert.equal(error.status, status); assert.equal(error.code, code); assert.equal(error.message, expected); return true;
    });
  }
});

test('maps semantic rate limiting to the requested cooldown message', async () => {
  await assert.rejects(requestSemanticSearch('問題', 'v7', { fetchImpl: async () => response({ error: { code: 'SEMANTIC_RATE_LIMITED' } }, 429) }), (error: any) => {
    assert.equal(error.message, '查詢稍微密集，請稍後再試。基本搜尋仍可使用。');
    return true;
  });
});

test('basic 503 uses Worker error envelope, remains local to basic search, and is not retried', async () => {
  let calls = 0;
  await assert.rejects(requestBasicSearch('都更', 'v7', { fetchImpl: async () => {
    calls++;
    return response({ error: { code: 'TOPIC_SEARCH_UNAVAILABLE', message: 'Unavailable' } }, 503);
  } }), (error: any) => {
    assert.equal(error.code, 'TOPIC_SEARCH_UNAVAILABLE');
    assert.equal(error.message, '基本搜尋目前無法使用，分類瀏覽仍可使用。');
    return true;
  });
  assert.equal(calls, 1);
});

test('basic search posts to its own endpoint and accepts the basic response shape', async () => {
  const found = await requestBasicSearch('都更', 'v7', { fetchImpl: async (url) => {
    assert.equal(url, '/api/topic-search');
    return response({ mode: 'fulltext-topic-search', topicIds: ['t001'], corpusVersion: 'v7' });
  } });
  assert.deepEqual(found.topicIds, ['t001']);
});

test('rejects a successful response for a different corpus version', async () => {
  await assert.rejects(requestSemanticSearch('問題', 'v7', { fetchImpl: async () => response({ ...result, corpusVersion: 'v6' }) }), (error: any) => {
    assert.equal(error.code, 'SEMANTIC_CORPUS_MISMATCH'); assert.match(error.message, /重新整理/); return true;
  });
});

test('caller cancellation aborts an in-flight request and timeout aborts without retry', async () => {
  const caller = new AbortController();
  let signal: AbortSignal | undefined;
  const pending = requestSemanticSearch('問題', 'v7', { signal: caller.signal, fetchImpl: (_url, options) => {
    signal = options.signal; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  caller.abort();
  await assert.rejects(pending);
  assert.equal(signal?.aborted, true);

  let calls = 0;
  await assert.rejects(requestSemanticSearch('問題', 'v7', { timeoutMs: 5, fetchImpl: (_url, options) => {
    calls++; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } }));
  assert.equal(calls, 1);
});
