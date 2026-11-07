import type { Env } from './types';
import { AppError } from './errors';
import { cleanupReports, listReports, reportsOpen, submitReport, updateReport } from './reports';
import { fulltextTopicSearch, semanticTopicSearch, semanticSearchConfigured } from './topic-retrieval';

function secureResponse(response: Response, development = false): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' https://challenges.cloudflare.com${development ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com${development ? ' ws://127.0.0.1:5173' : ''}; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`);
  if (!development) headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function retired() {
  return json({ error: { code: 'FEATURE_RETIRED', message: '即時查詢與文字生成已停止，請前往政策主題館閱讀既有整理內容。', href: '/topics/' } }, 410);
}

function topicsRedirect(request: Request): Response {
  const incoming = new URL(request.url);
  const target = new URL('/topics/', incoming);
  const query = incoming.searchParams.get('q')?.trim().slice(0, 150);
  const group = incoming.searchParams.get('group');
  const topic = incoming.searchParams.get('topic');
  if (query) target.searchParams.set('q', query);
  if (group && /^g\d{1,2}$/.test(group)) target.searchParams.set('group', group);
  if (topic && /^t\d{1,3}$/.test(topic)) target.searchParams.set('topic', topic);
  return new Response(null, { status: 302, headers: { Location: `${target.pathname}${target.search}`, 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env, ctx?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    let response: Response;
    if (path === '/api/config' && request.method === 'GET') {
      const open = Boolean(env.DB) && reportsOpen(env);
      response = json({ mode: 'static-topic-search', generationEnabled: false, live: false, reportsOpen: open, semanticSearchEnabled: semanticSearchConfigured(env), ...(open && env.TURNSTILE_SITE_KEY ? { turnstileSiteKey: env.TURNSTILE_SITE_KEY } : {}) });
    } else if (path === '/api/health' && request.method === 'GET') {
      response = json({ ok: true, mode: 'static-topic-search', generationEnabled: false });
    } else if (path === '/api/search' || path === '/api/generate') {
      response = retired();
    } else if (path === '/api/topic-search' || path === '/api/semantic-search') {
      try {
        response = json(await (path === '/api/semantic-search' ? semanticTopicSearch(request, env) : fulltextTopicSearch(request, env)));
      } catch (error) {
        const known = error instanceof AppError;
        response = json({ error: { code: known ? error.code : 'SEARCH_UNAVAILABLE', message: known ? error.message : '搜尋目前無法提供服務，仍可從分類瀏覽主題。' } }, known ? error.status : 503);
      }
    } else if (path === '/api/reports' || path.startsWith('/api/admin/reports')) {
      try {
        if (!env.DB) throw new AppError('NOT_FOUND', '查詢路徑不存在。', 404);
        if (path === '/api/reports' && request.method === 'POST') {
          response = json(await submitReport(request, env), 201);
          if (ctx) ctx.waitUntil(cleanupReports(env).catch(() => undefined));
        } else if (path === '/api/admin/reports' && request.method === 'GET') {
          response = json(await listReports(request, env));
        } else if (/^\/api\/admin\/reports\/[^/]+$/.test(path) && request.method === 'PATCH') {
          response = json(await updateReport(request, env, decodeURIComponent(path.split('/').pop() ?? '')));
        } else {
          response = json({ error: { code: 'NOT_FOUND', message: '查詢路徑不存在。' } }, 404);
        }
      } catch (error) {
        const known = error instanceof AppError;
        response = json({ error: { code: known ? error.code : 'SERVICE_ERROR', message: known ? error.message : '服務暫時無法完成這個操作，請稍後再試。' } }, known ? error.status : 503);
      }
    } else if (path.startsWith('/api/')) {
      response = json({ error: { code: 'NOT_FOUND', message: '查詢路徑不存在。' } }, 404);
    } else if ((path === '/' || path === '/index.html') && (request.method === 'GET' || request.method === 'HEAD')) {
      response = topicsRedirect(request);
    } else {
      try {
        response = await env.ASSETS.fetch(request);
      } catch {
        response = json({ error: { code: 'SERVICE_ERROR', message: '服務暫時無法完成這個操作，請稍後再試。' } }, 503);
      }
    }
    return secureResponse(response, env.ENVIRONMENT === 'development');
  },
};
