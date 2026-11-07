import type { Env } from './types';
import { AppError } from './errors';
import { checkOrigin, readInput, reserveRequest, verifyTurnstile } from './guards';
import { corpusStats, generationContext, searchEvidence } from './search';
import { generatePost } from './openai';

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

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    const path = new URL(request.url).pathname;
    let response: Response;
    try {
      if (path === '/api/config' && request.method === 'GET') {
        const stats = await corpusStats(env);
        const ready = stats.sources > 0 && stats.passages > 0 && Boolean(stats.version);
        response = json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null, stats, live: ready && Boolean(env.OPENAI_API_KEY) && (env.ENVIRONMENT === 'development' || Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.RATE_LIMIT_SALT)) });
      } else if (path === '/api/health' && request.method === 'GET') {
        const stats = await corpusStats(env);
        const ready = stats.sources > 0 && stats.passages > 0 && Boolean(stats.version);
        response = json({ ok: ready, stats }, ready ? 200 : 503);
      } else if (['/api/search', '/api/generate'].includes(path) && request.method === 'POST') {
        checkOrigin(request, env);
        const input = await readInput(request);
        const action = path === '/api/generate' ? 'generate' : 'search';
        if (action === 'generate') {
          if (!env.OPENAI_API_KEY) throw new AppError('AI_UNAVAILABLE', '文字整理服務尚未啟用，仍可先查閱來源資料。', 503);
          await verifyTurnstile(request, env, input.turnstileToken);
        }
        // Failed verification cannot consume the site's finite generation budget.
        await reserveRequest(request, env, action);
        const found = await searchEvidence(env, input.query);
        const stats = await corpusStats(env);
        const search = { query: input.query, results: found.evidence, searchMethod: found.method, corpusVersion: stats.version };
        if (action === 'search') response = json(search);
        else {
          const context = generationContext(found.evidence, input.query);
          const generated = await generatePost(env, input.query, input.mode, context, async (usage) => {
            await env.DB.prepare('INSERT INTO generation_usage(request_id,created_at,mode,input_tokens,output_tokens,estimated_usd) VALUES(?,?,?,?,?,?)')
              .bind(requestId, new Date().toISOString(), input.mode, usage.inputTokens, usage.outputTokens, usage.estimatedCostUsd).run();
          });
          response = json({ ...search, ...generated, requestId });
        }
        if (ctx) ctx.waitUntil(Promise.all([
          env.DB.prepare('DELETE FROM request_limits WHERE bucket IN (SELECT bucket FROM request_limits WHERE expires_at < ? LIMIT 100)').bind(Date.now()).run(),
          env.DB.prepare('DELETE FROM generation_usage WHERE created_at < ?').bind(new Date(Date.now() - 30 * 86400_000).toISOString()).run(),
        ]).catch(() => undefined));
      } else if (path.startsWith('/api/')) {
        response = json({ error: { code: 'NOT_FOUND', message: '查詢路徑不存在。', requestId } }, 404);
      } else {
        response = await env.ASSETS.fetch(request);
      }
    } catch (error) {
      const safe = error instanceof AppError ? error : new AppError('SERVICE_ERROR', '服務暫時無法完成這個操作，請稍後再試。', 503);
      response = json({ error: { code: safe.code, message: safe.message, requestId } }, safe.status);
    }
    return secureResponse(response, env.ENVIRONMENT === 'development');
  },
};
