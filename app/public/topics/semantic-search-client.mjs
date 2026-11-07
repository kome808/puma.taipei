const ERROR_MESSAGES = {
  SEMANTIC_QUOTA_EXHAUSTED: '語意搜尋本月額度已用完，目前無法提供服務。你仍可使用基本搜尋。',
  SEMANTIC_RATE_LIMITED: '查詢稍微密集，請稍後再試。基本搜尋仍可使用。',
  SEMANTIC_UNAVAILABLE: '語意搜尋目前無法使用，你仍可使用基本搜尋。',
  SEMANTIC_CORPUS_MISMATCH: '主題資料版本已更新，請重新整理頁面後再試。',
};

export class SemanticSearchError extends Error {
  constructor(message, code = 'SEMANTIC_UNAVAILABLE', status = 503) {
    super(message);
    this.name = 'SemanticSearchError';
    this.code = code;
    this.status = status;
  }
}

export function parseSemanticSearchResponse(payload) {
  if (!payload || payload.mode !== 'semantic-topic-search' || !Array.isArray(payload.topicIds) ||
      !payload.topicIds.every((id) => typeof id === 'string') || typeof payload.corpusVersion !== 'string' ||
      !payload.quota || payload.quota.limit !== 1000 || !Number.isInteger(payload.quota.used) ||
      payload.quota.used < 1 || payload.quota.used > 1000 || !Number.isInteger(payload.quota.remaining) ||
      payload.quota.remaining !== payload.quota.limit - payload.quota.used || typeof payload.quota.resetsAt !== 'string') {
    throw new SemanticSearchError('語意搜尋回傳資料格式不完整，你仍可使用基本搜尋。');
  }
  return payload;
}

export async function requestSemanticSearch(query, corpusVersion, { fetchImpl = fetch, signal, timeoutMs = 20_000 } = {}) {
  return requestSearch('/api/semantic-search', query, corpusVersion, 'semantic-topic-search', { fetchImpl, signal, timeoutMs });
}

export async function requestBasicSearch(query, corpusVersion, { fetchImpl = fetch, signal, timeoutMs = 20_000 } = {}) {
  return requestSearch('/api/topic-search', query, corpusVersion, 'fulltext-topic-search', { fetchImpl, signal, timeoutMs });
}

async function requestSearch(endpoint, query, corpusVersion, expectedMode, { fetchImpl, signal, timeoutMs }) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('Semantic search timed out', 'TimeoutError')), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, corpusVersion }), signal: controller.signal,
    });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const code = payload?.error?.code || 'SEARCH_UNAVAILABLE';
      const message = code === 'SEMANTIC_QUOTA_EXHAUSTED'
        ? ERROR_MESSAGES.SEMANTIC_QUOTA_EXHAUSTED
        : code === 'SEMANTIC_RATE_LIMITED'
          ? ERROR_MESSAGES.SEMANTIC_RATE_LIMITED
        : code === 'SEMANTIC_CORPUS_MISMATCH'
          ? ERROR_MESSAGES.SEMANTIC_CORPUS_MISMATCH
          : expectedMode === 'semantic-topic-search'
            ? ERROR_MESSAGES.SEMANTIC_UNAVAILABLE
            : '基本搜尋目前無法使用，分類瀏覽仍可使用。';
      throw new SemanticSearchError(message, code, response.status);
    }
    if (payload?.mode !== expectedMode) throw new SemanticSearchError('搜尋服務回傳資料格式不完整。');
    if (!Array.isArray(payload.topicIds) || !payload.topicIds.every((id) => typeof id === 'string') || typeof payload.corpusVersion !== 'string') {
      throw new SemanticSearchError('搜尋服務回傳資料格式不完整。');
    }
    if (payload.corpusVersion !== corpusVersion) {
      throw new SemanticSearchError(ERROR_MESSAGES.SEMANTIC_CORPUS_MISMATCH, 'SEMANTIC_CORPUS_MISMATCH', 409);
    }
    return expectedMode === 'semantic-topic-search' ? parseSemanticSearchResponse(payload) : payload;
  } catch (error) {
    if (error instanceof SemanticSearchError) throw error;
    if (controller.signal.aborted) {
      if (signal?.aborted) throw error;
      throw new SemanticSearchError(expectedMode === 'semantic-topic-search' ? '語意搜尋逾時，請稍後再試；基本搜尋仍可使用。' : '基本搜尋逾時，請稍後再試。');
    }
    throw new SemanticSearchError(expectedMode === 'semantic-topic-search' ? ERROR_MESSAGES.SEMANTIC_UNAVAILABLE : '基本搜尋目前無法使用，分類瀏覽仍可使用。');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
