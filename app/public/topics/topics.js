import { CATEGORY_ART } from './categories.js';

const $ = (selector) => document.querySelector(selector);
const state = { data: null, group: '', query: '', topic: null, copyTimer: null };
const dialog = $('#topic-dialog');
const stack = $('#browse-stack');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dateLabel(date) { return String(date).replaceAll('-', '.'); }
function normalized(value) { return value.normalize('NFKC').replaceAll('臺', '台').toLowerCase(); }

function topicText(topic) {
  return normalized([topic.title, topic.question, topic.intro, topic.group_title, ...topic.keywords,
    ...topic.official.map((p) => p.text), ...topic.interview.map((p) => p.text), topic.share.body].join(' '));
}
function queryMatches(topic) {
  const words = normalized(state.query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = topic._text ?? (topic._text = topicText(topic));
  return words.every((word) => text.includes(word));
}
function sourceKinds(topic) {
  return { official: topic.official.length > 0, interview: topic.interview.length > 0 };
}
function setAddress(topicId = state.topic?.id, push = false) {
  const url = new URL(location.href);
  for (const [key, value] of [['group', state.group], ['q', state.query.trim()], ['topic', topicId || '']]) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  if (push) history.pushState({ pumaTopicId: topicId }, '', url);
  else history.replaceState(null, '', url);
}

function badge(label, kind) {
  const node = element('span', `badge badge-${kind}`);
  node.append(element('i', 'badge-dot'), document.createTextNode(label));
  return node;
}
function sourceBadges(topic) {
  const wrap = element('span', 'badges');
  const { official, interview } = sourceKinds(topic);
  if (official) wrap.append(badge('官方政策', 'official'));
  if (interview) wrap.append(badge('訪談補充', 'interview'));
  if (topic.scope === 'public_issue') wrap.append(badge('公共議題觀點', 'issue'));
  return wrap;
}

function renderCategories(matchesByGroup) {
  const host = $('#categories'); host.replaceChildren();
  for (const group of state.data.groups) {
    const art = CATEGORY_ART[group.id];
    const count = matchesByGroup.get(group.id)?.length ?? 0;
    const card = element('button', `category-card${state.group === group.id ? ' selected' : ''}${!count ? ' no-match' : ''}`);
    card.type = 'button'; card.dataset.group = group.id;
    card.style.setProperty('--category-paper', art.paper); card.style.setProperty('--category-color', art.color);
    card.setAttribute('aria-pressed', String(state.group === group.id));
    card.setAttribute('aria-label', `${group.title}，${count}個主題`);
    const icon = element('span', 'category-icon'); icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = art.icon;
    card.append(icon, element('span', 'category-title', art.label), element('span', 'category-number', `${count} 題`));
    card.addEventListener('click', () => {
      state.group = state.group === group.id ? '' : group.id;
      render(); setAddress();
      const target = state.group ? $(`#group-${state.group}`) : $('#topic-sections');
      target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    host.append(card);
  }
  host.setAttribute('aria-busy', 'false');
}

function topicCard(topic) {
  const card = element('a', 'topic-card');
  card.href = `/topics/?topic=${topic.id}`; card.dataset.topic = topic.id;
  card.style.setProperty('--category-color', CATEGORY_ART[topic.group_id].color);
  const title = element('h4', 'topic-title', topic.title);
  const open = element('span', 'topic-open'); open.append('看說明與摘要 ', element('b', '', '↗'));
  card.append(sourceBadges(topic), title, element('p', 'topic-intro', topic.intro), open);
  card.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
    event.preventDefault(); openTopic(topic.id);
  });
  return card;
}

function render() {
  if (!state.data) return;
  const searching = Boolean(state.query.trim());
  stack.classList.toggle('is-searching', searching);
  const matchesByGroup = new Map();
  for (const group of state.data.groups) {
    matchesByGroup.set(group.id, state.data.topics.filter((t) => t.group_id === group.id && queryMatches(t)));
  }
  renderCategories(matchesByGroup);

  const host = $('#topic-sections'); host.replaceChildren();
  let shown = 0;
  for (const group of state.data.groups) {
    if (state.group && state.group !== group.id) continue;
    const list = matchesByGroup.get(group.id);
    if (!list.length) continue;
    shown += list.length;
    const art = CATEGORY_ART[group.id];
    const section = element('section', 'topic-group'); section.id = `group-${group.id}`;
    section.style.setProperty('--category-color', art.color); section.style.setProperty('--category-paper', art.paper);
    section.setAttribute('aria-labelledby', `heading-${group.id}`);
    const head = element('header', 'group-head');
    const icon = element('span', 'group-icon'); icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = art.icon;
    const text = element('div', 'group-text');
    const title = element('h3', '', group.title); title.id = `heading-${group.id}`;
    text.append(title, element('p', '', art.note));
    head.append(icon, text, element('span', 'group-count', `${list.length} 題`));
    const grid = element('div', 'topic-grid');
    for (const topic of list) grid.append(topicCard(topic));
    section.append(head, grid); host.append(section);
  }
  const total = state.data.topics.length;
  const groupName = state.group ? state.data.groups.find((g) => g.id === state.group)?.title : '';
  const parts = [];
  if (groupName) parts.push(`分類：${groupName}`);
  if (searching) parts.push(`關鍵字：「${state.query.trim()}」`);
  $('#result-count').textContent = parts.length ? `${shown} 個主題符合（${parts.join('、')}）` : `全部 ${total} 個主題，分成 ${state.data.groups.length} 類`;
  $('#clear-filters').hidden = !parts.length;
  $('#all-topics').classList.toggle('active', !state.group && !searching);
  $('#empty-state').hidden = shown !== 0;
}

function sourceLink(url, title) {
  const link = element('a', '', title); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
// Display only: break a long paragraph at sentence ends into chunks of about 90 characters.
function readableChunks(text) {
  const sentences = text.split(/(?<=。)/).filter(Boolean);
  const chunks = []; let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > 90) { chunks.push(current); current = ''; }
    current += sentence;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}
function renderParagraphs(selector, paragraphs, empty, topic) {
  const host = $(selector); host.replaceChildren();
  if (!paragraphs.length) { host.append(element('p', 'no-source', empty)); return; }
  for (const paragraph of paragraphs) {
    const block = element('div', 'content-paragraph');
    for (const chunk of readableChunks(paragraph.text)) block.append(element('p', '', chunk));
    const links = element('div', 'paragraph-sources');
    for (const url of paragraph.source_urls) {
      const source = topic.sources.find((s) => s.url === url); links.append(sourceLink(url, `${source?.title || '原文'} ↗`));
    }
    block.append(links); host.append(block);
  }
}

function decodeUrl(url) { try { return decodeURI(url); } catch { return url; } }
function updatePostState() {
  const value = $('#share-post').value;
  const expected = state.topic.share.source_urls.map(decodeUrl);
  const found = (value.match(/https:\/\/[^\s]+/g) || []).map(decodeUrl);
  const sourcesPresent = found.length === expected.length && expected.every((url) => found.includes(url));
  const withinLimit = value.length <= 500;
  $('#character-count').textContent = `${value.length} / 500 字元（含來源網址）`;
  $('#share-issue').textContent = !withinLimit ? '這段超過500字元，刪短一點再複製。' : !sourcesPresent ? '原文出處要一起帶走，請保留來源連結。' : '';
  $('#copy-post').disabled = !withinLimit || !sourcesPresent;
  $('#copy-status').textContent = '';
  if (dialog.open) fitPost();
}
function fitPost() {
  const field = $('#share-post'); field.style.height = 'auto';
  field.style.height = `${Math.min(900, Math.max(240, field.scrollHeight + 2))}px`;
}

function openTopic(id, updateAddress = true) {
  const topic = state.data.topics.find((t) => t.id === id); if (!topic) return;
  state.topic = topic; clearTimeout(state.copyTimer);
  $('#detail-group').textContent = `${CATEGORY_ART[topic.group_id].label} / ${topic.group_title}`;
  $('#detail-title').textContent = topic.title; $('#detail-intro').textContent = topic.intro;
  $('#detail-scope').hidden = true;
  const badges = $('#detail-badges'); badges.replaceChildren(...sourceBadges(topic).childNodes);
  renderParagraphs('#official-content', topic.official, '這一題目前沒有對應的官方政策內容，以下整理來自訪談／活動。', topic);
  renderParagraphs('#interview-content', topic.interview, '這一題目前沒有對應的訪談補充，內容來自官方政策頁。', topic);
  renderParagraphs('#difference-content', topic.differences, '', topic);
  $('#difference-section').hidden = !topic.differences.length; $('#difference-section').open = false;
  $('#share-post').value = topic.share.text; updatePostState();
  $('#copy-post span').textContent = '複製摘要與來源';
  const list = $('#detail-source-list'); list.replaceChildren();
  const sources = [...topic.sources].sort((a, b) => (a.type !== 'official') - (b.type !== 'official'));
  for (const source of sources) {
    const li = element('li'); li.append(element('span', 'detail-source-type', source.type === 'official' ? '官方政策' : '訪談／活動'), sourceLink(source.url, `${source.title} ↗`)); list.append(li);
  }
  if (!dialog.open) dialog.showModal(); dialog.scrollTop = 0; fitPost();
  $('#close-topic').focus({ preventScroll: true });
  if (updateAddress) setAddress(id, true);
}
function closeTopic() { dialog.close(); }

async function copyPost() {
  if ($('#copy-post').disabled) return;
  const value = $('#share-post').value; let timer;
  try {
    await Promise.race([navigator.clipboard.writeText(value), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('clipboard deadline')), 1600); })]);
  } catch {
    $('#share-post').focus(); $('#share-post').select();
    if (!document.execCommand('copy')) { $('#copy-status').textContent = '請選取上方文字，使用瀏覽器的複製功能。'; return; }
  } finally { clearTimeout(timer); }
  $('#copy-post span').textContent = '摘要已複製'; $('#copy-status').textContent = '摘要與來源已複製。';
  state.copyTimer = setTimeout(() => { $('#copy-post span').textContent = '複製摘要與來源'; }, 2500);
}

async function loadData() {
  $('#load-error').hidden = true; const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/topics/data.json', { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error('Content unavailable');
    const data = await response.json();
    if (!Array.isArray(data.topics) || !Array.isArray(data.groups) || !data.topics.length) throw new Error('Invalid topic data');
    state.data = data;
    const params = new URLSearchParams(location.search); const group = params.get('group');
    state.group = data.groups.some((g) => g.id === group) ? group : ''; state.query = (params.get('q') || '').slice(0, 150);
    $('#topic-query').value = state.query;
    $('#topic-count').textContent = data.topics.length; $('#all-count').textContent = data.topics.length; $('#group-count').textContent = data.groups.length;
    $('#source-count').textContent = data.topics.filter((t) => t.official.length).length;
    document.querySelectorAll('.snapshot-date').forEach((node) => { node.textContent = dateLabel(data.source_snapshot_date); });
    document.querySelectorAll('.content-date').forEach((node) => { node.textContent = dateLabel(data.content_updated || data.source_snapshot_date); });
    render(); if (params.has('topic')) openTopic(params.get('topic'), false);
  } catch {
    $('#categories').replaceChildren(); $('#categories').setAttribute('aria-busy', 'false');
    $('#load-error').hidden = false; $('#result-count').textContent = '主題暫時還沒載入';
  } finally { clearTimeout(timeout); }
}

function clearFilters() { state.query = ''; state.group = ''; $('#topic-query').value = ''; render(); setAddress(''); }
$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault(); $('#topic-query').blur();
  $('#filter-status').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});
$('#topic-query').addEventListener('input', (event) => { state.query = event.target.value; render(); setAddress(''); });
$('#all-topics').addEventListener('click', clearFilters); $('#clear-search').addEventListener('click', clearFilters); $('#clear-filters').addEventListener('click', clearFilters);
$('#retry-load').addEventListener('click', loadData); $('#close-topic').addEventListener('click', closeTopic);
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeTopic(); } });
dialog.addEventListener('close', () => {
  const previous = state.topic; state.topic = null;
  if (!previous) return;
  if (history.state?.pumaTopicId === previous.id) history.back(); else setAddress('');
});
$('#share-post').addEventListener('input', updatePostState); $('#restore-post').addEventListener('click', () => { $('#share-post').value = state.topic.share.text; updatePostState(); });
$('#copy-post').addEventListener('click', copyPost);
window.addEventListener('popstate', () => {
  if (!state.data) return; const params = new URLSearchParams(location.search);
  state.group = state.data.groups.some((g) => g.id === params.get('group')) ? params.get('group') : '';
  state.query = (params.get('q') || '').slice(0, 150); $('#topic-query').value = state.query; render();
  if (params.has('topic')) openTopic(params.get('topic'), false);
  else if (dialog.open) { state.topic = null; dialog.close(); }
});
for (let i = 0; i < 15; i++) $('#categories').append(element('div', 'category-skeleton'));
loadData();
