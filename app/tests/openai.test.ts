import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePost } from '../worker/openai';
import type { Evidence } from '../shared/contracts';
import type { Env } from '../worker/types';

const evidence: Evidence[] = [{ id: 'e1', sourceId: 's1', title: '運動政策', kind: 'official', url: 'https://puma.taipei/policies/運動政策', section: '社區運動', text: '規劃社區運動小巴，提供運動教學。', verification: 'downloaded_not_fact_checked', notes: [] }];
const env = { OPENAI_API_KEY: 'test-credential', OPENAI_MODEL: 'gpt-6-luna' } as Env;
function response(body: string) {
  return Response.json({ status: 'completed', usage: { input_tokens: 400, output_tokens: 100 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ relevant: true, body, evidenceIds: ['e1'] }) }] }] });
}

test('overlong generation is shortened once with all billed usage accumulated', async () => {
  const requests: Record<string, unknown>[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model, 'gpt-6-luna');
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.strict, true);
    requests.push(payload);
    return response(requests.length === 1 ? '政策'.repeat(300) : '官方政策規劃社區運動小巴，提供運動教學。');
  };
  const generated = await generatePost(env, '社區運動', 'share', evidence, undefined, fetcher as typeof fetch);
  assert.equal(requests.length, 2);
  assert.equal(generated.usage.inputTokens, 800);
  assert.equal(generated.usage.outputTokens, 200);
  assert.ok(generated.characterCount <= 500);
  assert.ok(generated.post.endsWith('https://puma.taipei/policies/運動政策'));
});

test('two failed shorten attempts cannot leak an overlength copyable draft', async () => {
  let requests = 0;
  const fetcher = async () => { requests++; return response('政策'.repeat(300)); };
  await assert.rejects(generatePost(env, '社區運動', 'share', evidence, undefined, fetcher as typeof fetch), /500/);
  assert.equal(requests, 2);
});

test('provider errors do not reveal provider body or credentials', async () => {
  const fetcher = async () => new Response('private-provider-diagnostic test-credential', { status: 401 });
  await assert.rejects(generatePost(env, '社區運動', 'share', evidence, undefined, fetcher as typeof fetch), (error: Error) => !error.message.includes('test-credential') && !error.message.includes('private-provider'));
});

test('missing sources and missing credentials fail before a provider request', async () => {
  let called = false;
  const fetcher = async () => { called = true; return response('說明'); };
  await assert.rejects(generatePost(env, '社區運動', 'share', [], undefined, fetcher as typeof fetch));
  await assert.rejects(generatePost({} as Env, '社區運動', 'share', evidence, undefined, fetcher as typeof fetch));
  assert.equal(called, false);
});

test('a source-count retry tells the model to remove claims that need a third source', async () => {
  const items = [
    ...evidence,
    { ...evidence[0], id: 'e2', sourceId: 's2', title: '社福政策', url: 'https://puma.taipei/policies/社福政策' },
    { ...evidence[0], id: 'e3', sourceId: 's3', title: '家庭一站通', url: 'https://puma.taipei/policies/家庭一站通' },
  ];
  let calls = 0;
  const instructions: string[] = [];
  const fetcher = async (_url: unknown, init?: RequestInit) => {
    calls++;
    instructions.push(JSON.parse(String(init?.body)).instructions);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ relevant: true, body: '官方政策規劃社區運動小巴。', evidenceIds: calls === 1 ? ['e1', 'e2', 'e3'] : ['e1'] }) }] }] });
  };
  const result = await generatePost(env, '社區運動', 'share', items, undefined, fetcher as typeof fetch);
  assert.equal(calls, 2);
  assert.equal(result.sources.length, 1);
  assert.match(instructions[1], /前稿引用超過兩個來源/);
  assert.match(instructions[1], /刪去/);
});
