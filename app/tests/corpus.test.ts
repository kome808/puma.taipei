import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const builder = await import('../scripts/build-corpus.mjs');
const root = new URL('../../', import.meta.url);

test('canonical corpus is deterministic and maps each logical entry once', async () => {
  const first = await builder.buildCorpusFromSnapshot(root.pathname);
  const second = await builder.buildCorpusFromSnapshot(root.pathname);

  assert.deepEqual(first.corpus, second.corpus);
  assert.equal(first.stats.inputTextRecords, 203);
  assert.equal(first.stats.logicalEntries, 74);
  assert.equal(first.corpus.sources.length, 98);

  const interviewSources = first.corpus.sources.filter((source: any) => ['interview', 'article'].includes(source.kind));
  assert.equal(new Set(interviewSources.map((source: any) => source.groupId)).size, 74);
  assert.equal(interviewSources.filter((source: any) => source.kind === 'article').length, 37);
  assert.equal(interviewSources.filter((source: any) => source.kind === 'interview').length, 37);
  assert.ok(first.corpus.sources.every((source: any) => /^[a-z0-9_-]+$/.test(source.id)));
  assert.ok(first.corpus.sources.every((source: any) => !/\.(?:md|json|docx)(?:$|\?)/i.test(source.url)));

  const featured = first.corpus.sources.find((source: any) => source.groupId === 'entry-featured-01-58ee1f909d');
  assert.deepEqual(featured.relatedUrls, ['http://www.youtube.com/watch?v=QJ8-y1L5YNM']);
});

test('cleaning removes extraction markup while retaining policy and speaker context', async () => {
  const result = await builder.buildCorpusFromSnapshot(root.pathname);
  const allText = result.corpus.passages.map((passage: any) => passage.text).join('\n');

  assert.equal(/!\[[^\]]*\]\([^)]*\)/.test(allText), false, 'image markdown remains');
  assert.equal(/抓取時間|來源類型|POLICIES/.test(allText), false, 'extraction metadata remains');
  assert.match(allText, /沈伯洋/);
  assert.match(allText, /00:\d{2}:\d{2}/);
  assert.match(allText, /教育政策/);

  const transcript = builder.cleanSourceText([
    '# 範例逐字稿｜提供的原稿',
    '## 訪談核心摘要與政策主張',
    '這一段是編輯整理，不是逐字引文。',
    '## 完整訪談逐字稿',
    '### 一、開場',
    '[00:00:01] 主持人：請說明政策。',
  ].join('\n'), { title: '範例逐字稿', kind: 'transcript_page' });
  assert.equal(transcript.includes('編輯整理'), false, 'editorial transcript preamble remains');
  assert.match(transcript, /主持人：請說明政策/);

  const sportsSource = result.corpus.sources.find((source: any) => source.groupId === 'entry-talks-14-a0a02cc752');
  const sportsPassages = result.corpus.passages.filter((passage: any) => passage.sourceId === sportsSource.id);
  assert.ok(sportsPassages.length > 0);
  assert.ok(sportsPassages.every((passage: any) => !/核心摘要與政策主張/.test(passage.section)));
  assert.match(sportsPassages.map((passage: any) => passage.text).join('\n'), /運動驛站/);

  const carriedSpeaker = sportsPassages.find((passage: any) => passage.id.endsWith('-p0005'));
  assert.equal(carriedSpeaker.section, '第四章：長照不如長訓——高齡社會的處方化肌力訓練 (09:15 - 17:30)｜接續語者：沈伯洋');
  assert.match(carriedSpeaker.text, /政府如果要在社區推動「長訓」/);
  assert.doesNotMatch(carriedSpeaker.text, /^沈伯洋：/);

  const inheritedSections = result.corpus.passages.map((passage: any) => passage.section).filter((section: string) => section.includes('接續語者'));
  assert.ok(inheritedSections.every((section: string) => !/影片長度|第一個我就寫|再來很重要的是|第二部分/.test(section)));
});

test('passages preserve source context and emit FTS-friendly Chinese tokens', async () => {
  const result = await builder.buildCorpusFromSnapshot(root.pathname);
  const sourceIds = new Set(result.corpus.sources.map((source: any) => source.id));

  assert.ok(result.corpus.passages.length > 200);
  for (const passage of result.corpus.passages) {
    assert.ok(sourceIds.has(passage.sourceId));
    assert.match(passage.id, /^[a-z0-9_-]+-p\d{4}$/);
    assert.ok(passage.text.length > 0);
    assert.ok(passage.tokens.length > 0);
    assert.doesNotMatch(passage.tokens, /[，。！？；、]/);
  }

  const longPassages = result.corpus.passages.filter((passage: any) => passage.text.length > 900);
  assert.ok(longPassages.length < result.corpus.passages.length * 0.03);
});

test('generated SQL is idempotent and contains the FTS5 contract', async () => {
  const result = await builder.buildCorpusFromSnapshot(root.pathname);
  assert.match(result.sql.schema, /CREATE VIRTUAL TABLE IF NOT EXISTS passage_fts USING FTS5/i);
  assert.match(result.sql.data, /ON CONFLICT\(id\) DO UPDATE/i);
  assert.match(result.sql.data, /BEGIN;[\s\S]*COMMIT;/);

  const generated = JSON.parse(await readFile(new URL('../generated/corpus.json', import.meta.url), 'utf8'));
  assert.equal(generated.version, result.corpus.version);
});
