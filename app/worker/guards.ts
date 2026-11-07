import { AppError } from './errors';
import type { Env } from './types';

export async function readInput(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new AppError('INVALID_CONTENT_TYPE', '請使用網站表單查詢。', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('INVALID_INPUT', '請輸入想了解的議題。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16_384) { await reader.cancel(); throw new AppError('INPUT_TOO_LONG', '內容太長，請保留最想討論的問題。', 413); }
    chunks.push(value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  let value: Record<string, unknown>;
  try { value = JSON.parse(new TextDecoder().decode(joined)); } catch { throw new AppError('INVALID_INPUT', '查詢內容格式不正確。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('INVALID_INPUT', '查詢內容格式不正確。');
  const query = typeof value.query === 'string' ? value.query.trim() : '';
  if (query.length < 2) throw new AppError('INVALID_INPUT', '請輸入至少兩個字的議題或問題。');
  if (query.length > 3500) throw new AppError('INPUT_TOO_LONG', '請將內容縮短至 3,500 字元內。', 413);
  if (value.mode !== 'share' && value.mode !== 'reply') throw new AppError('INVALID_MODE', '請選擇分享政策或社群回應幫手。');
  return { query, mode: value.mode, turnstileToken: typeof value.turnstileToken === 'string' ? value.turnstileToken : '' } as { query: string; mode: 'share' | 'reply'; turnstileToken: string };
}

export function checkOrigin(request: Request, env: Env) {
  const expected = env.ALLOWED_ORIGIN || new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin && origin !== expected) throw new AppError('INVALID_ORIGIN', '請從本網站進行操作。', 403);
}

export async function verifyTurnstile(request: Request, env: Env, token: string) {
  if (env.ENVIRONMENT === 'development') return;
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) throw new AppError('SERVICE_NOT_READY', '文字整理服務尚在設定中，仍可先查閱來源。', 503);
  if (!token || token.length > 2048) throw new AppError('VERIFICATION_REQUIRED', '請完成網頁驗證後再試。', 403);
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: request.headers.get('CF-Connecting-IP') || undefined }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new AppError('VERIFICATION_FAILED', '網頁驗證暫時無法完成，請稍後重試。', 503); }
  const data = await response.json() as { success?: boolean; hostname?: string; action?: string };
  if (!data.success || data.hostname !== new URL(request.url).hostname || data.action !== 'generate') {
    throw new AppError('VERIFICATION_FAILED', '網頁驗證已過期，請重新驗證後再試。', 403);
  }
}

async function reserve(env: Env, key: string, max: number, expiresAt: number) {
  const row = await env.DB.prepare(`INSERT INTO request_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`).bind(key, expiresAt, max).first();
  if (!row) throw new AppError('RATE_LIMITED', '今天或這段時間的使用次數較多，請稍後再試。', 429);
}

export async function reserveRequest(request: Request, env: Env, action: 'search' | 'generate') {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const minute = Math.floor(now / 60_000);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const salt = env.RATE_LIMIT_SALT || (env.ENVIRONMENT === 'development' ? 'development' : '');
  if (!salt) throw new AppError('SERVICE_NOT_READY', '服務尚在設定中，請稍後重試。', 503);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${day}:${ip}`));
  const client = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  await reserve(env, `${action}:minute:${minute}:${client}`, action === 'generate' ? 6 : 20, now + 120_000);
  await reserve(env, `${action}:day:${day}:${client}`, env.ENVIRONMENT === 'development' ? 500 : action === 'generate' ? 30 : 100, now + 172_800_000);
  const globalMax = action === 'generate' ? Math.max(1, Math.min(10_000, Number(env.DAILY_GLOBAL_LIMIT) || 1000)) : 10_000;
  await reserve(env, `${action}:global:${day}`, globalMax, now + 172_800_000);
}
