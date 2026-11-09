import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildTopicPages, renderLibraryPage, renderSummaryHtml, renderTopicPage, topicPath } from '../scripts/build-topic-pages.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const data = JSON.parse(await readFile(resolve(root, 'public/topics/data.json'), 'utf8'));
const decodeHtml = (value: string) => value
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

test('all topic footers match the homepage while keeping each topic content date',async()=>{
  const template=await readFile(resolve(root,'public/topics/index.html'),'utf8');
  const footer=(html:string)=>html.match(/<footer\b[\s\S]*?<\/footer>/)![0];
  const normalize=(html:string)=>html.replace(/data-content-version="[^"]*"/,'data-content-version="DATE"').replace(/(<span class="content-date">)[^<]*(<\/span>)/,'$1DATE$2');
  const home=footer(renderLibraryPage(template,data));
  assert.ok(home.includes('本站以 AI 輔助整理政策重點，'));
  for(const topic of data.topics){
    const actual=footer(renderTopicPage(topic,data));
    assert.equal(normalize(actual),normalize(home),`${topic.id} has a different footer`);
    const date=topic.content_updated||data.content_updated||data.source_snapshot_date;
    assert.ok(actual.includes(`data-content-version="${date}"`));
    assert.ok(actual.includes(`<span class="content-date">${date.replaceAll('-','.')}</span>`));
    assert.equal((actual.match(/id="site-report-form"/g)||[]).length,1);
  }
});

test('t005 uses its policy text card while every other topic uses the current three-step social preview',()=>{
  const topic=data.topics.find((t:{id:string})=>t.id==='t005');
  const html=renderTopicPage(topic,data);
  const image='https://puma-note.pages.dev/social/t005-housing-20261109-v4.png';
  assert.ok(html.includes(`<meta property="og:image" content="${image}">`));
  assert.ok(html.includes(`<meta name="twitter:image" content="${image}">`));
  assert.match(html,/<meta property="og:image:width" content="1200">/);
  assert.match(html,/<meta property="og:image:height" content="630">/);
  for (const otherTopic of data.topics.filter((t:{id:string})=>t.id!=='t005')) {
    const other=renderTopicPage(otherTopic,data);
    const fallback='https://puma-note.pages.dev/og-image-steps-20261109.png';
    assert.ok(other.includes(`<meta property="og:image" content="${fallback}">`),otherTopic.id);
    assert.ok(other.includes(`<meta name="twitter:image" content="${fallback}">`),otherTopic.id);
    assert.ok(!other.includes('og-image-ocean-20261108.png'),otherTopic.id);
    assert.ok(!other.includes(image),otherTopic.id);
  }
});

test('build emits 86 standalone, readable topic pages with stable canonical metadata', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'topic-pages-test-'));
  try {
    assert.equal(await buildTopicPages(output), 86);
    const expectedPaths = new Set(data.topics.map((topic: { id: string }) => `${topic.id}/index.html`));
    const files = await readdir(resolve(output, 'topics'), { recursive: true });
    assert.deepEqual(new Set(files.map(String).filter((path) => path.endsWith('/index.html'))), expectedPaths);
    const canonicals = new Set<string>();
    const titles = new Set<string>();
    for (const topic of data.topics) {
      const html = await readFile(resolve(output, 'topics', topic.id, 'index.html'), 'utf8');
      const canonical = `https://puma-note.pages.dev/topics/${topic.id}/`;
      assert.match(html, /<html lang="zh-Hant-TW">/);
      assert.match(html, /<script type="module" src="\/topics\/topic-page\.mjs"><\/script>/);
      assert.match(html, /<h1 id="detail-title">[^<]+<\/h1>/);
      assert.match(html, new RegExp(`<main id="topic-page" class="wrap topic-page" data-topic-id="${topic.id}"`));
      assert.ok(html.includes(`data-source-snapshot-date="${data.source_snapshot_date}"`));
      assert.ok(html.includes(`data-content-updated="${topic.content_updated || data.content_updated}"`));
      assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`));
      assert.ok(html.includes(`<meta property="og:url" content="${canonical}">`));
      assert.ok(html.includes(`<meta property="og:title" content="${topic.title}｜Puma政策筆記">`));
      assert.ok(html.includes(`<title>${topic.title}｜Puma政策筆記</title>`));
      assert.ok(html.includes(`<h1 id="detail-title">${topic.title}</h1>`));
      assert.ok(html.includes('id="copy-post"') && html.includes('id="copy-link"') && html.includes('id="report-box"'));
      assert.ok(html.includes('<noscript>'), 'summary remains in server-rendered HTML without JavaScript');
      assert.ok(!html.includes('id="official-section"') && !html.includes('id="interview-section"'));
      assert.ok(!html.includes('id="editable-summary"') && !html.includes('id="restore-summary"'));
      assert.doesNotMatch(html, /[?&]topic=/, 'canonical and page identity must not depend on a query parameter');
      const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)">/);
      assert.ok(canonicalMatch);
      canonicals.add(canonicalMatch[1]);
      titles.add(topic.title);
      const summary = html.match(/<div id="share-post"[^>]*>([\s\S]*?)<\/div>/)?.[1];
      assert.equal(summary, renderSummaryHtml(topic), `${topic.id} server-rendered summary differs from source text`);
      assert.equal(decodeHtml(summary!.replace(/<a\b[^>]*>|<\/a>/g, '')), topic.share.text,
        `${topic.id} summary text and whitespace should match the saved share text exactly`);
      const anchors = [...summary!.matchAll(/<a class="summary-source" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
      const cited = topic.share.source_urls;
      assert.equal(anchors.length, cited.length, `${topic.id} should have one anchor for each cited URL`);
      const decodeUri = (value: string) => { try { return decodeURI(value); } catch { return value; } };
      assert.deepEqual(anchors.map((match) => decodeUri(decodeHtml(match[1]))), cited.map(decodeUri));
      assert.deepEqual(anchors.map((match) => decodeHtml(match[2])), cited.map(decodeUri));
    }
    assert.equal(canonicals.size, 86);
    assert.equal(titles.size, 86);
    await assert.rejects(readFile(resolve(output, 'topics', 'unknown', 'index.html')));
    const notFound = await readFile(resolve(output, '404.html'), 'utf8');
    assert.match(notFound, /<h1>找不到這個主題<\/h1>/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('topic and summary rendering escapes HTML-looking content and preserves ampersand URLs as text and links', () => {
  const attack = '<img src=x onerror=alert(1)>';
  const url = 'https://example.test/source?a=1&b=<script>alert(1)</script>';
  const syntheticTopic = {
    id: 't999', group_title: '測試', title: `標題 ${attack}`, scope: 'municipal_policy',
    sources: [{ url, type: 'official' }],
    share: { body: `摘要 ${attack}`, text: `摘要 ${attack}\n\n來源：\n${url}`, source_urls: [url] },
  };
  const syntheticData = { source_snapshot_date: '2026-11-07', content_updated: '2026-11-07' };
  const html = renderTopicPage(syntheticTopic, syntheticData);
  assert.ok(html.includes(`標題 &lt;img src=x onerror=alert(1)&gt;｜Puma政策筆記`));
  assert.ok(html.includes(`摘要 &lt;img src=x onerror=alert(1)&gt;`));
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  const summaryHtml = renderSummaryHtml(syntheticTopic);
  assert.equal((summaryHtml.match(/class="summary-source"/g) || []).length, 1);
  assert.ok(summaryHtml.includes('href="https://example.test/source?a=1&amp;b=&lt;script&gt;alert(1)&lt;/script&gt;"'));
  assert.ok(summaryHtml.includes('>https://example.test/source?a=1&amp;b=&lt;script&gt;alert(1)&lt;/script&gt;</a>'));
  assert.equal(decodeHtml(summaryHtml.replace(/<a\b[^>]*>|<\/a>/g, '')), syntheticTopic.share.text);
  assert.equal(topicPath('t999'), '/topics/t999/');
  assert.throws(() => topicPath('../bad'));
});
