import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SITE_ORIGIN, jsonLdScript, libraryStructuredData, topicStructuredData } from './structured-data.mjs';
import { buildSummaryCopy } from '../public/topics/summary-copy.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = SITE_ORIGIN;
const topicSocialImages = {
  t005: {
    path: '/social/t005-housing-20261109-v4.png',
    portrait: '/social/t005-housing-portrait-20261109-v4.png',
    portraitPreview: '/social/t005-housing-portrait-20261109-v4.webp',
    alt: '沈伯洋住宅政策：活化空屋、多元社宅與依家庭需求規劃住宅。',
  },
};
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const decode = (value) => { try { return decodeURI(value); } catch { return value; } };
const footerPattern = /<footer\b[^>]*class="site-footer wrap"[\s\S]*?<\/footer>/;
// The homepage owns the footer markup; every topic reuses it with its own dates.
const siteFooterTemplate = readFileSync(resolve(app, 'public/topics/index.html'), 'utf8').match(footerPattern)?.[0];
if (!siteFooterTemplate) throw new Error('Homepage footer template is missing');

function renderSiteFooter(snapshot, updated) {
  const displayDate = (value) => escape(String(value).replaceAll('-', '.'));
  return siteFooterTemplate
    .replace(/data-content-version="[^"]*"/, `data-content-version="${escape(updated)}"`)
    .replace(/(<span class="snapshot-date">)[^<]*(<\/span>)/g, (_, start, end) => start + displayDate(snapshot) + end)
    .replace(/(<span class="content-date">)[^<]*(<\/span>)/g, (_, start, end) => start + displayDate(updated) + end);
}

export function topicPath(id) {
  if (!/^t\d{3}$/.test(id)) throw new Error('Invalid topic ID');
  return `/topics/${id}/`;
}

export function renderSummaryHtml(topic) {
  const urls = new Set(topic.share.source_urls.map(decode));
  return topic.share.text.split(/(https:\/\/[^\s]+)/g).map((part) => urls.has(decode(part))
    ? `<a class="summary-source" href="${escape(part)}" target="_blank" rel="noopener noreferrer">${escape(part)}</a>`
    : escape(part)).join('');
}

export function renderLibraryPage(template, data) {
  const marker = '<!-- policy-structured-data -->';
  if (template.split(marker).length !== 2) throw new Error('Library template requires exactly one structured data marker');
  return template.replace(marker, () => jsonLdScript(libraryStructuredData(data)))
    .replace(footerPattern, () => renderSiteFooter(data.source_snapshot_date, data.content_updated || data.source_snapshot_date));
}

const reportForm = `<div class="report-box" id="report-box">
  <button type="button" id="open-report" class="report-toggle" aria-expanded="false" aria-controls="report-form">發現錯誤？回報這一題</button>
  <div id="report-form" class="report-form" hidden>
    <label for="report-type">問題類型</label><select id="report-type"><option>數字或金額與原文不符</option><option>來源連結打不開</option><option>與原文意思不符</option><option>官方政策已更新</option><option>其他</option></select>
    <label for="report-note">哪裡有問題（選填，請勿填個人資料）</label><textarea id="report-note" maxlength="300" rows="3" placeholder="例如：第二段的次數與官網不同"></textarea>
    <input type="text" name="website" id="report-website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div id="report-turnstile" class="report-turnstile"></div>
    <p id="report-turnstile-status" class="copy-status" role="status" aria-live="polite"></p>
    <div class="report-actions"><button type="button" id="report-send" class="report-send" hidden>送出問題回報</button><button type="button" id="report-copy" class="report-copy">複製回報內容</button></div>
    <p id="report-status" class="copy-status" role="status" aria-live="polite"></p>
    <p class="report-privacy">按「送出問題回報」會把題號、問題類型與你填的說明存進網站的資料庫（只供維護者核對，不記錄姓名、聯絡方式或IP，保存180天）；請勿填個人資料。「複製回報內容」則完全不傳送任何資料。</p>
  </div>
</div>`;

export function renderTopicPage(topic, data) {
  const canonical = `${origin}${topicPath(topic.id)}`;
  const title = `${topic.title}｜Puma政策筆記`;
  const socialImage = topicSocialImages[topic.id] || { path: '/og-image-steps-20261109.png', alt: 'Puma政策筆記：政策分享，3 步驟就上手，找到主題、一鍵複製、分享到社群平台' };
  const shareCard = socialImage.portrait ? `
      <section class="topic-share-card" aria-labelledby="share-card-title">
        <h2 id="share-card-title">下載圖卡，分享政策</h2>
        <p class="topic-share-card-intro">點圖開啟原圖，或選擇尺寸下載。</p>
        <a class="topic-share-card-preview" href="${escape(socialImage.portrait)}" target="_blank" rel="noopener noreferrer" aria-label="開啟住宅政策圖卡原圖"><img src="${escape(socialImage.portraitPreview)}" alt="${escape(socialImage.alt)}" width="1080" height="1350" loading="lazy" decoding="async"></a>
        <div class="topic-share-card-downloads">
          <a class="card-download card-download-primary" href="${escape(socialImage.portrait)}" download="Puma政策筆記_住宅政策_直式圖卡.png">下載直式圖卡<span>1080 × 1350・PNG</span></a>
          <a class="card-download" href="${escape(socialImage.path)}" download="Puma政策筆記_住宅政策_橫式圖卡.png">下載橫式圖卡<span>1200 × 630・PNG</span></a>
        </div>
      </section>` : '';
  const description = Array.from(topic.share.body.replace(/\s+/g, ' ').trim()).slice(0, 150).join('');
  const cited = new Set(topic.share.source_urls);
  const hasOfficial = topic.sources.some((source) => cited.has(source.url) && source.type === 'official');
  const hasInterview = topic.sources.some((source) => cited.has(source.url) && source.type === 'interview');
  const badges = [hasOfficial && ['official', '官方政策'], hasInterview && ['interview', '訪談補充'], topic.scope === 'public_issue' && ['issue', '公共議題觀點']]
    .filter(Boolean).map(([type, text]) => `<span class="badge badge-${type}"><i class="badge-dot"></i>${text}</span>`).join('');
  const snapshot = data.source_snapshot_date;
  const updated = topic.content_updated || data.content_updated || snapshot;
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#fff8ed">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <link rel="canonical" href="${canonical}">
  ${jsonLdScript(topicStructuredData(topic, data, canonical))}
  <meta property="og:type" content="article"><meta property="og:site_name" content="Puma政策筆記"><meta property="og:locale" content="zh_TW">
  <meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${origin}${socialImage.path}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escape(socialImage.alt)}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${origin}${socialImage.path}"><meta name="twitter:image:alt" content="${escape(socialImage.alt)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/topics/topics.css">
  <script type="module" src="/topics/topic-page.mjs"></script>
  <script type="module" src="/topics/site-report.mjs"></script>
</head>
<body class="standalone-topic">
  <a class="skip" href="#topic-page">跳到主題摘要</a>
  <header class="site-header wrap"><a class="brand" href="/" aria-label="Puma政策筆記首頁"><span class="brand-mark" aria-hidden="true">P</span><span><strong>Puma政策筆記</strong><small>政策與訪談的獨立整理</small></span></a><nav aria-label="主要導覽"><a href="/topics/">回主題館 <span aria-hidden="true">↗</span></a></nav></header>
  <main id="topic-page" class="wrap topic-page" data-topic-id="${escape(topic.id)}" data-source-snapshot-date="${escape(snapshot)}" data-content-updated="${escape(updated)}">
    <article class="topic-paper">
      <p class="eyebrow">${escape(topic.group_title)}</p><div class="badges">${badges}</div>
      <h1 id="detail-title">${escape(topic.title)}</h1>
      <section class="share-panel summary-panel" aria-label="短摘要與來源連結">
        <div id="share-post" class="summary-content" tabindex="0" aria-label="短摘要與來源連結">${renderSummaryHtml(topic)}</div>
        <div class="share-tools"><span id="character-count" class="character-count">${buildSummaryCopy(topic.title, topic.share.text).length} / 500 字元（含標題與來源網址）</span></div>
        <div class="topic-actions"><button type="button" id="copy-post" class="copy-button"><span>複製標題、摘要與來源</span></button><button type="button" id="copy-link" class="copy-link-button"><span>複製本題連結</span></button></div>
        <p id="copy-status" class="copy-status" role="status" aria-live="polite"></p><p id="link-copy-status" class="copy-status" role="status" aria-live="polite"></p>
        ${reportForm}
      </section>
      ${shareCard}
    </article>
  </main>
  ${renderSiteFooter(snapshot, updated)}
  <noscript><p class="wrap">可直接閱讀摘要與開啟來源；複製時請選取文字，使用瀏覽器的複製功能。</p></noscript>
</body>
</html>
`;
}

export async function buildTopicPages(outputDir) {
  const data = JSON.parse(await readFile(resolve(app, 'public/topics/data.json'), 'utf8'));
  const ids = new Set();
  if (!Array.isArray(data.topics) || data.topics.length !== data.topic_count) throw new Error('Invalid public topic data');
  await mkdir(resolve(outputDir, 'topics'), { recursive: true });
  const library = await readFile(resolve(app, 'public/topics/index.html'), 'utf8');
  await writeFile(resolve(outputDir, 'topics/index.html'), renderLibraryPage(library, data));
  for (const topic of data.topics) {
    topicPath(topic.id);
    if (ids.has(topic.id)) throw new Error(`Duplicate topic: ${topic.id}`);
    ids.add(topic.id);
    const folder = resolve(outputDir, 'topics', topic.id);
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, 'index.html'), renderTopicPage(topic, data));
  }
  await writeFile(resolve(outputDir, '404.html'), '<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>找不到頁面｜Puma政策筆記</title><link rel="stylesheet" href="/topics/topics.css"></head><body><main class="wrap topic-page"><h1>找不到這個主題</h1><p>連結可能有誤，請回主題館查找。</p><a href="/topics/">回主題館</a></main></body></html>\n');
  return ids.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const destination = process.argv[2] || 'dist';
  if (!['dist', 'static-dist'].includes(destination)) throw new Error('Unsupported build destination');
  const count = await buildTopicPages(resolve(app, destination));
  console.log(`Built ${count} standalone topic pages in ${destination}`);
}
