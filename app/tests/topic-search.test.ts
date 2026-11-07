import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchTopics } from '../public/topics/topic-search.mjs';

const data = JSON.parse(readFileSync(new URL('../public/topics/data.json', import.meta.url), 'utf8'));
const ids = (query: string) => searchTopics(data.topics, query).map((topic: any) => topic.id);

test('natural questions retrieve the matching existing policy notes', () => {
  assert.equal(ids('無限都更一開始的房子要怎樣來')[0], 't065');
  assert.ok(ids('銀髮族肌肉流失可以做什麼').includes('t028'));
  assert.equal(ids('老師行政工作太多怎麼辦')[0], 't007');
  assert.ok(ids('臨時沒人幫忙帶小孩').includes('t013'));
});

test('AI-coach search favors the industry note over exercise-coach notes', () => {
  const results = ids('AI教練如何協助傳統產業');
  assert.equal(results[0], 't060');
  assert.ok(!results.includes('t028'));
});

test('muscle and AI-coach queries do not leak into unrelated administration or exercise topics', () => {
  const muscle = ids('銀髮族肌肉流失可以做什麼');
  assert.equal(muscle[0], 't028');
  assert.ok(!muscle.includes('t026'));
  assert.ok(!ids('肌力').includes('t060'));
  const aiCoach = ids('AI教練');
  assert.equal(aiCoach[0], 't060');
  assert.ok(!aiCoach.includes('t028'));
});

test('partial terms and punctuation normalization remain useful', () => {
  assert.ok(ids('肌力').includes('t028'));
  assert.ok(ids('都更').includes('t001'));
  assert.ok(ids('臺北市，教師！')[0] === 't007');
});

test('unrelated queries return no noisy matches and blank queries preserve order', () => {
  assert.deepEqual(ids('量子火星烤箱'), []);
  assert.deepEqual(searchTopics(data.topics, '  ？！ '), data.topics);
  assert.deepEqual(searchTopics(data.topics, ''), data.topics);
});

test('results are original records and search never changes their summaries or query', () => {
  const selected = data.topics.find((topic: any) => topic.id === 't013');
  const before = JSON.stringify(selected.share);
  const query = '臨時托育 怎麼申請';
  const found = searchTopics([selected], query);
  assert.equal(found[0], selected);
  assert.equal(JSON.stringify(selected.share), before);
  assert.equal(query, '臨時托育 怎麼申請');
});
