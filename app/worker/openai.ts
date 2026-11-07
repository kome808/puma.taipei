import type { Evidence, Mode } from '../shared/contracts';
import { AppError } from './errors';
import { bodyBudget, buildInstructions, finishDraft, validateDraft } from './generation';
import type { Env } from './types';

type Usage = { inputTokens: number; outputTokens: number; estimatedCostUsd: number };

const format = {
  type: 'json_schema', name: 'sourced_policy_post', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: { relevant: { type: 'boolean' }, evidenceIds: { type: 'array', items: { type: 'string' } }, body: { type: 'string' } },
    required: ['relevant', 'evidenceIds', 'body'],
  },
};

export async function generatePost(
  env: Env,
  query: string,
  mode: Mode,
  evidence: Evidence[],
  onUsage: (usage: Usage) => Promise<void> = async () => {},
  fetcher: typeof fetch = fetch,
) {
  if (!env.OPENAI_API_KEY) throw new AppError('AI_UNAVAILABLE', '文字整理服務尚未啟用，仍可先查閱來源資料。', 503);
  if (!evidence.length) throw new AppError('NO_EVIDENCE', '目前沒有找到相關來源，請換個具體議題查詢。', 422);
  let maxBody = bodyBudget(evidence);
  let correction = '';
  const usage: Usage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
  const sourceInfo = [...new Map(evidence.map((e) => [e.sourceId, {
    id: e.sourceId, title: e.title, kind: e.kind,
    verification: e.verification.slice(0, 180),
    notes: e.notes.slice(0, 2).map((note) => note.slice(0, 180)),
  }])).values()];
  const input = JSON.stringify({ task: mode, userText: query, sources: sourceInfo,
    evidence: evidence.map(({ id, sourceId, section, text }) => ({ id, sourceId, section, text })),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetcher('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-6-luna',
          instructions: buildInstructions(mode, maxBody) + correction, input,
          reasoning: { effort: 'none' }, max_output_tokens: 1400, store: false,
          text: { format },
        }),
        signal: AbortSignal.timeout(35000),
      });
    } catch {
      throw new AppError('AI_TIMEOUT', '文字整理暫時連線逾時，請稍後重試。', 504);
    }
    if (!response.ok) {
      // Never expose provider bodies, credentials, request contents or internal details.
      throw new AppError('AI_PROVIDER_ERROR', response.status === 429 ? '文字整理目前使用較多，請稍後再試。' : '文字整理服務暫時無法使用，請稍後再試。', response.status === 429 ? 429 : 502);
    }
    const result = await response.json() as {
      status?: string; usage?: { input_tokens?: number; output_tokens?: number };
      output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    };
    const current = { inputTokens: result.usage?.input_tokens || 0, outputTokens: result.usage?.output_tokens || 0, estimatedCostUsd: 0 };
    current.estimatedCostUsd = current.inputTokens * 0.10 / 1_000_000 + current.outputTokens * 0.50 / 1_000_000;
    usage.inputTokens += current.inputTokens;
    usage.outputTokens += current.outputTokens;
    usage.estimatedCostUsd += current.estimatedCostUsd;
    await onUsage(current);
    if (result.status !== 'completed') throw new AppError('INCOMPLETE_GENERATION', '這次文字整理未完成，請再試一次。', 502);
    const text = result.output?.flatMap((item) => item.type === 'message' ? item.content || [] : []).filter((part) => part.type === 'output_text').map((part) => part.text || '').join('') || '';
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new AppError('INVALID_GENERATION', '這次整理格式不完整，請重新整理。', 502); }
    try {
      const draft = validateDraft(parsed, evidence);
      return { ...finishDraft(draft, evidence), usage };
    } catch (error) {
      if (attempt === 0 && error instanceof AppError && error.code === 'UNSUPPORTED_ABSENCE') {
        correction = '\n重新整理：前稿把檢索片段當成沒有提過的證明。移除這類否定，只寫原文明確支持的具體做法；完整閱讀所有提供段落，涵蓋問題中的不同做法。';
        continue;
      }
      if (attempt === 0 && error instanceof AppError && ['POST_TOO_LONG', 'INVALID_GENERATION', 'TOO_MANY_SOURCES'].includes(error.code)) {
        if (error.code === 'TOO_MANY_SOURCES') {
          correction = '\n重新整理：前稿引用超過兩個來源。請先從現有證據中選擇最多兩個最相關的來源，刪去需要第三個來源才能支持的說法，再回傳正文與這兩個來源內的 evidenceIds。不得只刪引用而保留失去依據的說法。';
        }
        maxBody = Math.max(60, Math.floor(maxBody * 0.72));
        continue;
      }
      throw error;
    }
  }
  throw new AppError('INVALID_GENERATION', '這次文字整理未完成，請再試一次。', 502);
}
