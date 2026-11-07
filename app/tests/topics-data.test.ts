import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { countCharacters } from '../shared/post';

type Source = { title: string; url: string; type: 'official' | 'interview' };
type Topic = {
  id: string; group_id: string; title: string; scope: string; intro: string;
  official: { text: string; source_urls: string[] }[]; interview: { text: string; source_urls: string[] }[]; differences: { text: string }[];
  sources: Source[]; share: { body: string; text: string; source_urls: string[]; utf16_length: number };
};
type Data = { name: string; topic_count: number; groups: { id: string; title: string }[]; topics: Topic[] };

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const data = JSON.parse(read('content/policy-topics/expanded-topics.json')) as Data;
const decode = (url: string) => { try { return decodeURI(url); } catch { return url; } };

test('86 topics in 15 groups, every topic reachable by a unique ID', () => {
  assert.equal(data.groups.length, 15);
  assert.equal(data.topics.length, 86);
  assert.equal(new Set(data.topics.map((t) => t.id)).size, 86);
  const groupIds = new Set(data.groups.map((g) => g.id));
  for (const topic of data.topics) assert.ok(groupIds.has(topic.group_id), `${topic.id} has unknown group`);
  for (const group of data.groups) assert.ok(data.topics.some((t) => t.group_id === group.id), `${group.id} is empty`);
});

test('every short summary, including source URLs and newlines, stays within 500 UTF-16 units', () => {
  for (const topic of data.topics) {
    const { share } = topic;
    assert.ok(countCharacters(share.text) <= 500, `${topic.id} exceeds 500`);
    assert.equal(share.utf16_length, countCharacters(share.text), `${topic.id} stored length differs`);
    assert.ok(share.utf16_length >= 250, `${topic.id} is unexpectedly short`);
    assert.ok(share.text.startsWith(share.body), `${topic.id} text does not start with body`);
    assert.doesNotMatch(share.body, /https?:\/\//, `${topic.id} embeds a URL in the body`);
    const urls = share.text.match(/https:\/\/[^\s]+/g)?.map(decode) ?? [];
    assert.deepEqual(urls, share.source_urls.map(decode), `${topic.id} URLs differ from share.source_urls`);
    assert.ok(urls.length >= 1 && urls.length <= 3, `${topic.id} must cite one to three sources`);
  }
});

test('summary sources exist in the topic, official sources come before interviews, and types match the topic content', () => {
  for (const topic of data.topics) {
    const byUrl = new Map(topic.sources.map((s) => [s.url, s]));
    const types = topic.share.source_urls.map((url) => byUrl.get(url)?.type);
    assert.ok(types.every(Boolean), `${topic.id} cites a source outside its source list`);
    const firstInterview = types.indexOf('interview');
    if (firstInterview >= 0) assert.ok(!types.slice(firstInterview).includes('official'), `${topic.id} lists an official source after an interview`);
    if (!topic.official.length) assert.ok(!types.includes('official'), `${topic.id} has no official content but cites an official source`);
    if (!topic.interview.length) assert.ok(!types.includes('interview'), `${topic.id} has no interview content but cites an interview`);
    for (const paragraph of [...topic.official, ...topic.interview]) {
      for (const url of paragraph.source_urls) assert.ok(byUrl.has(url), `${topic.id} paragraph cites missing source`);
    }
  }
});

test('public-issue topics are framed as views, not municipal services', () => {
  const issues = data.topics.filter((t) => t.scope === 'public_issue');
  assert.equal(issues.length, 5);
  for (const topic of issues) assert.match(topic.share.body, /公共議題|不是台北市政|不是市長/, `${topic.id} must flag its public-issue nature`);
});

test('summaries avoid generic boilerplate endings and slogan-like phrases', () => {
  const banned = ['具體資格、地點與服務安排仍待方案說明', '先看一版', '值得打開看看', '投票給', '支持沈伯洋', '請支持'];
  for (const topic of data.topics) {
    for (const phrase of banned) assert.ok(!topic.share.body.includes(phrase), `${topic.id} contains "${phrase}"`);
  }
});

test('the site name is unified and no old brand text remains in public pages', () => {
  assert.equal(data.name, 'Puma政策筆記');
  for (const file of ['index.html', 'public/topics/index.html', 'src/App.tsx']) {
    const text = read(file);
    assert.ok(!text.includes('沈伯洋政策分享蒟蒻'), `${file} still has the old name`);
    assert.ok(!text.includes('蒟蒻'), `${file} still has the mascot phrasing`);
  }
  assert.match(read('index.html'), /<title>Puma政策筆記/);
  assert.match(read('public/topics/index.html'), /<title>政策主題館｜Puma政策筆記<\/title>/);
  assert.match(read('public/topics/index.html'), /og:site_name" content="Puma政策筆記"/);
  assert.match(read('public/topics/index.html'), /非官方網站/);
});

test('the summary check table passes and explains every short summary', () => {
  const path = 'content/policy-topics/revisions/2026-11-07-summary-500/validation.json';
  assert.ok(existsSync(new URL(`../${path}`, import.meta.url)));
  const report = JSON.parse(read(path)) as { status: string; topics_checked: number; max: number; rows: { id: string; utf16: number; below_target_reason: string }[] };
  assert.equal(report.status, 'passed');
  assert.equal(report.topics_checked, 86);
  assert.ok(report.max <= 500);
  for (const row of report.rows) if (row.utf16 < 400) assert.ok(row.below_target_reason && row.below_target_reason !== '(missing)', `${row.id} lacks a reason`);
});

test('the exported public data mirrors the source data when it has been built', () => {
  const path = 'public/topics/data.json';
  if (!existsSync(new URL(`../${path}`, import.meta.url))) return;
  const exported = JSON.parse(read(path)) as Data & { content_updated: string };
  assert.equal(exported.topics.length, 86);
  assert.equal(exported.name, data.name);
  assert.ok(exported.content_updated);
  for (const topic of exported.topics) {
    const original = data.topics.find((t) => t.id === topic.id)!;
    assert.equal(topic.share.text, original.share.text);
    assert.equal('editor_notes' in topic, false, `${topic.id} leaks editor notes`);
  }
});
