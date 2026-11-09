import { AppError } from './errors';
import { checkOrigin } from './guards';
import type { Env } from './types';
import manifest from '../shared/topic-search-manifest.json';
import { ftsQuery } from '../shared/topic-fts.mjs';
import { searchTopics } from '../public/topics/topic-search.mjs';

export const SEMANTIC_MONTHLY_LIMIT = 1000;
const allowedIds = new Set<string>(manifest.topicIds);
const UNAVAILABLE = '語意搜尋目前無法提供服務，請改用基本搜尋。';
const EXHAUSTED = '語意搜尋本月額度已用完，目前無法提供服務。你仍可使用基本搜尋。';
export type ValidatedSearch = { query: string; corpusVersion: string; queryOrigin: 'typed' | 'popular' };
type SearchObserver = (input: ValidatedSearch) => void;

export function semanticSearchConfigured(env: Env) {
  return env.SEMANTIC_SEARCH_ENABLED === 'true' && Boolean(env.DB && env.SEMANTIC_SEARCH?.search && env.RATE_LIMIT_SALT && env.RATE_LIMIT_SALT.length >= 24);
}

async function reserveClientAttempt(request: Request, env: Env, now: Date) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.RATE_LIMIT_SALT}:semantic:${ip}`));
  const client = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const timestamp = now.getTime();
  try {
    await env.DB.prepare('DELETE FROM request_limits WHERE bucket IN (SELECT bucket FROM request_limits WHERE expires_at < ? LIMIT 100)').bind(timestamp).run();
    for (const [windowMs, limit] of [[60000, 5], [86400000, 30]]) {
      const window = Math.floor(timestamp / windowMs);
      const row = await env.DB.prepare(`INSERT INTO request_limits(bucket,count,expires_at) VALUES(?,1,?)
        ON CONFLICT(bucket) DO UPDATE SET count=request_limits.count+1 WHERE request_limits.count < ? RETURNING count`)
        .bind(`semantic-client:${windowMs}:${window}:${client}`, (window + 1) * windowMs, limit).first<{ count: number }>();
      if (!row) throw new AppError('SEMANTIC_RATE_LIMITED', '查詢稍微密集，請稍後再試。基本搜尋仍可使用。', 429);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('SEMANTIC_UNAVAILABLE', UNAVAILABLE, 503);
  }
}

async function readQuery(request: Request, env: Env) {
  if (request.method !== 'POST') throw new AppError('METHOD_NOT_ALLOWED', '請使用網站的搜尋功能。', 405);
  checkOrigin(request, env);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new AppError('INVALID_CONTENT_TYPE', '請使用網站的搜尋功能。', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('INVALID_INPUT', '請輸入問題或關鍵字。');
  const parts: Uint8Array[] = []; let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2048) { await reader.cancel(); throw new AppError('INPUT_TOO_LONG', '問題請在150字以內。', 413); }
    parts.push(value);
  }
  const joined = new Uint8Array(length); let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; }
  let input: unknown;
  try { input = JSON.parse(new TextDecoder().decode(joined)); } catch { throw new AppError('INVALID_INPUT', '搜尋內容格式不正確。'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('INVALID_INPUT', '搜尋內容格式不正確。');
  const body = input as Record<string, unknown>;
  const query = typeof body.query === 'string' ? body.query.normalize('NFKC').trim() : '';
  if (query.length < 2) throw new AppError('INVALID_INPUT', '請輸入至少兩個字的問題或關鍵字。');
  if (query.length > 150) throw new AppError('INPUT_TOO_LONG', '問題請在150字以內。', 413);
  if (body.corpusVersion !== manifest.corpusVersion) throw new AppError('SEMANTIC_CORPUS_MISMATCH', '主題資料已更新，請重新整理頁面後再試。', 409);
  return { query, corpusVersion: manifest.corpusVersion, queryOrigin: body.queryOrigin === 'popular' ? 'popular' as const : 'typed' as const };
}

async function requireCurrentIndex(env: Env, semantic: boolean) {
  const code = semantic ? 'SEMANTIC_UNAVAILABLE' : 'TOPIC_SEARCH_UNAVAILABLE';
  const message = semantic ? UNAVAILABLE : '基本搜尋目前無法提供服務，仍可從分類瀏覽主題。';
  if (!env.DB) throw new AppError(code, message, 503);
  try {
    const row = await env.DB.prepare("SELECT value,(SELECT COUNT(*) FROM policy_topic_fts WHERE corpus_version=?) AS topic_count FROM topic_search_meta WHERE key='corpus_version'")
      .bind(manifest.corpusVersion).first<{ value: string; topic_count: number }>();
    if (row?.value !== manifest.corpusVersion || row.topic_count !== manifest.topicIds.length) throw new Error('index not current');
  } catch { throw new AppError(code, message, 503); }
}

export async function fulltextTopicSearch(request: Request, env: Env, observe?: SearchObserver) {
  const input = await readQuery(request, env);
  try { observe?.(input); } catch { /* Observability must not affect retrieval. */ }
  const { query } = input;
  await requireCurrentIndex(env, false);
  const match = ftsQuery(query);
  if (!match) return { mode: 'fulltext-topic-search', corpusVersion: manifest.corpusVersion, topicIds: [] as string[] };
  try {
    const rows = await env.DB.prepare('SELECT id,payload FROM policy_topic_fts WHERE policy_topic_fts MATCH ? AND corpus_version=? ORDER BY bm25(policy_topic_fts,0,0,9,5,6,0.65,0) LIMIT 86')
      .bind(match, manifest.corpusVersion).all<{ id: string; payload: string }>();
    const topics = rows.results.filter((row) => allowedIds.has(row.id)).map((row) => {
      const topic = JSON.parse(row.payload) as Record<string, unknown>;
      if (topic.id !== row.id) throw new Error('invalid index record');
      return topic;
    });
    const ranked = searchTopics(topics, query);
    // Numeric phrases such as 6次 can match FTS even if the lexical ranker's
    // word segmenter separates their characters. Keep that exact FTS result.
    const matches = ranked.length ? ranked : (/\d/.test(query) ? topics : []);
    return { mode: 'fulltext-topic-search', corpusVersion: manifest.corpusVersion, topicIds: [...new Set(matches.map((topic) => topic.id as string))].slice(0, 12) };
  } catch { throw new AppError('TOPIC_SEARCH_UNAVAILABLE', '基本搜尋目前無法提供服務，仍可從分類瀏覽主題。', 503); }
}

function billingPeriod(env: Env, now: Date) {
  if (!Number.isFinite(now.getTime())) throw new AppError('SEMANTIC_UNAVAILABLE', UNAVAILABLE, 503);
  const day = Number(env.SEMANTIC_QUOTA_RESET_DAY || '1');
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new AppError('SEMANTIC_UNAVAILABLE', UNAVAILABLE, 503);
  const startOfMonth = (year: number, month: number) => {
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, days)));
  };
  const year = now.getUTCFullYear(); const month = now.getUTCMonth();
  const current = startOfMonth(year, month);
  const start = now >= current ? current : startOfMonth(year, month - 1);
  const end = now >= current ? startOfMonth(year, month + 1) : current;
  return { period: start.toISOString().slice(0, 10), resetsAt: end.toISOString() };
}

export async function reserveSemanticSearch(env: Env, now = new Date()) {
  const { period, resetsAt } = billingPeriod(env, now);
  if (!env.DB) throw new AppError('SEMANTIC_UNAVAILABLE', UNAVAILABLE, 503);
  let row: { count: number } | null;
  try {
    // A single conditional write reserves the slot before any upstream call.
    // No SELECT-then-UPDATE race; do not retry or refund an uncertain write.
    row = await env.DB.prepare(`INSERT INTO semantic_search_usage(period,count,updated_at) VALUES(?,1,?)
      ON CONFLICT(period) DO UPDATE SET count=semantic_search_usage.count+1,updated_at=excluded.updated_at
      WHERE semantic_search_usage.count < ? RETURNING count`)
      .bind(period, now.toISOString(), SEMANTIC_MONTHLY_LIMIT).first<{ count: number }>();
  } catch { throw new AppError('SEMANTIC_UNAVAILABLE', UNAVAILABLE, 503); }
  if (!row) throw new AppError('SEMANTIC_QUOTA_EXHAUSTED', EXHAUSTED, 429);
  if (!Number.isInteger(row.count) || row.count < 1 || row.count > SEMANTIC_MONTHLY_LIMIT) throw new AppError('SEMANTIC_UNAVAILABLE', UNAVAILABLE, 503);
  return { limit: SEMANTIC_MONTHLY_LIMIT, used: row.count, remaining: SEMANTIC_MONTHLY_LIMIT - row.count, resetsAt };
}

export async function semanticTopicSearch(request: Request, env: Env, now = new Date(), observe?: SearchObserver) {
  const input = await readQuery(request, env);
  try { observe?.(input); } catch { /* Observability must not affect retrieval. */ }
  const { query } = input;
  if (!semanticSearchConfigured(env)) throw new AppError('SEMANTIC_UNAVAILABLE', UNAVAILABLE, 503);
  await requireCurrentIndex(env, true);
  await reserveClientAttempt(request, env, now);
  const quota = await reserveSemanticSearch(env, now);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      env.SEMANTIC_SEARCH!.search({
        query,
        ai_search_options: {
          retrieval: { retrieval_type: 'hybrid', max_num_results: 20, match_threshold: 0.35, context_expansion: 0, filters: { folder: `${manifest.prefix}/` } },
          query_rewrite: { enabled: false },
          cache: { enabled: false },
        },
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 12000); }),
    ]);
    if (!result || !Array.isArray(result.chunks)) throw new Error('invalid response');
    const matches = result.chunks.filter((chunk) => Number.isFinite(chunk?.score) && chunk.score >= 0.35 && typeof chunk?.item?.key === 'string')
      .sort((a, b) => b.score - a.score)
      .flatMap((chunk) => {
        if (!chunk.item.key.startsWith(`${manifest.prefix}/`)) return [];
        const suffix = chunk.item.key.slice(manifest.prefix.length + 1);
        const id = /^(t\d{3})\.md$/.exec(suffix)?.[1];
        return id && allowedIds.has(id) ? [id] : [];
      });
    if (result.chunks.length && !matches.length) throw new Error('no current indexed topics');
    return { mode: 'semantic-topic-search', corpusVersion: manifest.corpusVersion, topicIds: [...new Set(matches)].slice(0, 12), quota };
  } catch { throw new AppError('SEMANTIC_UNAVAILABLE', UNAVAILABLE, 503); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
