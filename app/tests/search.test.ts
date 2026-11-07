import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openLocalDatabase } from '../scripts/local-database';
import { generationContext, keywordSearch, queryTerms, searchEvidence } from '../worker/search';
import type { Env } from '../worker/types';
import type { Corpus } from '../shared/contracts';

const database = openLocalDatabase();
const env = { DB: database.db } as Env;
after(() => database.close());

test('urban-renewal stalled-project question retrieves actual exchange/exit explanation', async () => {
  const result = await keywordSearch(env, '都更如果原本的案子一直卡住，屋主有其他選擇嗎？');
  assert.ok(result.slice(0, 4).some((e) => /退場|交換|退出/.test(e.text)), 'top four should contain concrete next-option explanation');
});

test('community strength question returns official sport evidence rather than unrelated elder mentions', async () => {
  const result = await keywordSearch(env, '關心長輩肌力，社區運動和教練服務有哪些政策？');
  assert.ok(result.slice(0, 4).some((e) => e.kind === 'official' && /運動/.test(e.title)), 'top four should contain official sport policy');
  assert.ok(result.every((e) => /運動|肌力|肌肉|健身|教練|場館/.test(e.text + e.section)), 'all results must address the topic');
  assert.ok(result.slice(0, 4).some((e) => /專業合格體能教練制度|社區指導補貼機制/.test(e.text)), 'top four should include the actual community coach mechanism');
  assert.ok(!result.slice(0, 4).some((e) => e.title === '客家政策'), 'cultural venues are not fitness evidence');
});

test('search query punctuation cannot become executable FTS syntax', () => {
  assert.ok(queryTerms('都更" OR 1=1; DROP TABLE sources;').every((term) => !term.includes('"') && !term.includes(';')));
});

test('bounded context preserves both requested exit and home-exchange explanations', async () => {
  const query = '都更案一直卡住，居民一定只能等下去嗎？他有提到退場或換屋的做法嗎？';
  const result = await keywordSearch(env, query);
  // Semantic fusion can rank broad discussion ahead of the exchange mechanism.
  const exchange = /交換的平台|交換平台|一換一|換屋/;
  const ranked = [...result].sort((a, b) => Number(exchange.test(a.text)) - Number(exchange.test(b.text)));
  const context = generationContext(ranked, query);
  assert.ok(context.some((e) => /退場/.test(e.text)));
  assert.ok(context.some((e) => /交換的平台|交換平台|一換一|換屋/.test(e.text)), 'exchange evidence must survive the context budget');
  assert.ok(context.reduce((sum, e) => sum + e.text.length, 0) <= 3200);
  assert.ok(context.every((e) => result.some((original) => original.id === e.id && original.text === e.text)), 'preserve full original paragraphs');
});

test('first homes question retrieves the actual public-land interview explanation', async () => {
  for (const query of [
    '無限都更一開始的房子要怎樣來',
    '無限都更第一批新房從哪裡來？',
    '先蓋房子給都更住戶搬，要先去哪裡找土地？',
  ]) {
    const result = await keywordSearch(env, query);
    const directlyAnswers = (e: (typeof result)[number]) => e.kind === 'interview' && /先找出一塊公有地/.test(e.text);
    assert.ok(result.slice(0, 3).some(directlyAnswers), `top three must explain first housing supply: ${query}`);
    assert.ok(generationContext(result, query).some(directlyAnswers), 'the explanation must reach the model');
  }
});

test('first-step wording in unrelated policy questions does not expand to housing supply', () => {
  for (const query of ['通學區一開始要怎麼改善？', '無限都更一開始如何估價？']) {
    const terms = queryTerms(query);
    assert.ok(!terms.some((term) => ['公有地', '國有地', '房源', '先蓋'].includes(term)));
  }
});

test('semantic chunks starting midway through a transcript map back to the full original paragraph', async () => {
  const corpus = JSON.parse(readFileSync(new URL('../generated/corpus.json', import.meta.url), 'utf8')) as Corpus;
  const paragraph = corpus.passages.find((p) => /先找出一塊公有地/.test(p.text))!;
  assert.ok(paragraph);
  const middle = paragraph.text.slice(paragraph.text.indexOf('沈伯洋（受訪來賓）'));
  assert.ok(!middle.includes(paragraph.text.slice(0, 30)), 'fixture excludes the original opening');
  const semanticEnv = {
    ...env,
    AI_SEARCH: { search: async () => ({ chunks: [{ item: { key: `search-docs/${paragraph.sourceId}.md` }, score: 1, text: middle }] }) },
  } as Env;
  const result = await searchEvidence(semanticEnv, '先找出一塊公有地直接蓋新住宅');
  assert.equal(result.method, 'ai-search', 'a genuine middle-of-paragraph match must not fall back to keyword-only');
  assert.ok(result.evidence.some((e) => e.id === paragraph.id && e.text === paragraph.text));
});

test('a short shared opening and source metadata do not masquerade as a semantic passage match', async () => {
  const corpus = JSON.parse(readFileSync(new URL('../generated/corpus.json', import.meta.url), 'utf8')) as Corpus;
  const paragraph = corpus.passages.find((p) => /先找出一塊公有地/.test(p.text))!;
  const semanticEnv = {
    ...env,
    AI_SEARCH: { search: async () => ({ chunks: [{ item: { key: `search-docs/${paragraph.sourceId}.md` }, score: 1, text: `${paragraph.text.slice(0, 30)}\nsource_id: ${paragraph.sourceId}` }] }) },
  } as Env;
  const result = await searchEvidence(semanticEnv, '無限都更一開始的房子要怎樣來');
  assert.equal(result.method, 'keyword');
});

test('a parenting context does not discard the retrieved school-route safety policy', async () => {
  const corpus = JSON.parse(readFileSync(new URL('../generated/corpus.json', import.meta.url), 'utf8')) as Corpus;
  const paragraph = corpus.passages.find((p) => p.id === 'src-policy-02-p0005')!;
  const semanticEnv = {
    ...env,
    AI_SEARCH: { search: async () => ({ chunks: [{ item: { key: `search-docs/${paragraph.sourceId}.md` }, score: 1, text: paragraph.text }] }) },
  } as Env;
  const query = '育兒家庭帶孩子走路上學，怎麼讓學校周邊更安全？';
  const result = await searchEvidence(semanticEnv, query);
  assert.ok(result.evidence.some((e) => e.id === paragraph.id), 'a retrieved transport policy must survive a parenting word in the question');
  assert.ok(generationContext(result.evidence, query).some((e) => e.id === paragraph.id), 'the original answer must reach generation');
});

test('semantic relevance survives conversational wording without literal policy terms', async () => {
  const corpus = JSON.parse(readFileSync(new URL('../generated/corpus.json', import.meta.url), 'utf8')) as Corpus;
  const paragraph = corpus.passages.find((p) => p.id === 'src-policy-05-p0002')!;
  const semanticEnv = {
    ...env,
    AI_SEARCH: { search: async () => ({ chunks: [{ item: { key: `search-docs/${paragraph.sourceId}.md` }, score: 1, text: paragraph.text }] }) },
  } as Env;
  const query = '台北夏天走路很曬，政策只是多種幾棵樹嗎？';
  const result = await searchEvidence(semanticEnv, query);
  assert.ok(result.evidence.slice(0, 3).some((e) => e.id === paragraph.id), 'the first managed result must not be crowded out by literal keyword hits');
  assert.ok(generationContext(result.evidence, query).some((e) => e.id === paragraph.id));
});

test('repeated managed chunks cannot duplicate evidence or exceed the source budget', async () => {
  const corpus = JSON.parse(readFileSync(new URL('../generated/corpus.json', import.meta.url), 'utf8')) as Corpus;
  const paragraphs = corpus.passages.filter((p) => p.sourceId === 'src-policy-05').slice(1, 6);
  const chunks = paragraphs.map((p) => ({ item: { key: `search-docs/${p.sourceId}.md` }, score: 1, text: p.text }));
  const semanticEnv = { ...env, AI_SEARCH: { search: async () => ({ chunks: [...chunks, ...chunks] }) } } as Env;
  const result = await searchEvidence(semanticEnv, '都市微森林');
  assert.ok(result.evidence.length <= 8);
  assert.equal(new Set(result.evidence.map((e) => e.id)).size, result.evidence.length);
  for (const sourceId of new Set(result.evidence.map((e) => e.sourceId))) {
    assert.ok(result.evidence.filter((e) => e.sourceId === sourceId).length <= 2);
  }
  assert.ok(result.evidence.some((e) => e.sourceId === 'src-policy-05'));
});

test('a managed search failure preserves the existing keyword fallback', async () => {
  const query = '關心長輩肌力，社區運動和教練服務有哪些政策？';
  const semanticEnv = { ...env, AI_SEARCH: { search: async () => { throw new Error('Search temporarily unavailable'); } } } as Env;
  const result = await searchEvidence(semanticEnv, query);
  assert.equal(result.method, 'keyword');
  assert.deepEqual(result.evidence, await keywordSearch(env, query));
});
