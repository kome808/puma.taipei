import { CATEGORY_ART } from './categories.js';

const $ = (selector) => document.querySelector(selector);
const PAGE_SIZE = 9;
const state = { data: null, group: '', query: '', visible: PAGE_SIZE, topic: null, copyTimer: null };
const dialog = $('#topic-dialog');
const results = $('#results-section');
const browseResultsPosition = document.createComment('Browse results position');
results.before(browseResultsPosition);

function positionResults() {
  if (state.query.trim()) {
    const form = $('#search-form');
    if (results.previousElementSibling !== form) form.after(results);
  } else if (results.parentNode !== browseResultsPosition.parentNode) {
    browseResultsPosition.after(results);
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dateLabel(date) { return date.replaceAll('-', '.'); }
function normalized(value) { return value.normalize('NFKC').replaceAll('臺', '台').toLowerCase(); }
function queryMatches(topic) {
  const words = normalized(state.query).split(/\s+/).filter(Boolean);
  const text = normalized([topic.title, topic.question, topic.intro, topic.group_title, ...topic.keywords,
    ...topic.official.map(p => p.text), ...topic.interview.map(p => p.text)].join(' '));
  return words.every(word => text.includes(word));
}
function setAddress(topicId = state.topic?.id, push = false) {
  const url = new URL(location.href);
  for (const [key, value] of [['group', state.group], ['q', state.query], ['topic', topicId || '']]) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  if (push) history.pushState({ pumaTopicId: topicId }, '', url);
  else history.replaceState(null, '', url);
}

function renderCategories() {
  const host = $('#categories'); host.replaceChildren();
  for (const group of state.data.groups) {
    const art = CATEGORY_ART[group.id];
    const count = state.data.topics.filter(t => t.group_id === group.id && queryMatches(t)).length;
    const card = element('button', `category-card${state.group === group.id ? ' selected' : ''}${state.query && !count ? ' no-match' : ''}`);
    card.type = 'button'; card.dataset.group = group.id;
    card.style.setProperty('--category-paper', art.paper); card.style.setProperty('--category-color', art.color);
    card.setAttribute('aria-pressed', String(state.group === group.id));
    card.setAttribute('aria-label', `${group.title}，${count}個主題`);
    const icon = element('span', 'category-icon'); icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = art.icon;
    card.append(icon, element('span', 'category-number', `${count} 題`), element('span', 'category-title', art.label),
      element('span', 'category-note', art.note), element('span', 'category-selected-mark', '✓'));
    card.addEventListener('click', () => {
      state.group = state.group === group.id ? '' : group.id; state.visible = PAGE_SIZE; render(); setAddress();
      const heading = $('#results-heading'); heading.focus({ preventScroll: true });
      $('#results-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    host.append(card);
  }
  host.setAttribute('aria-busy', 'false');
}

function render() {
  if (!state.data) return;
  positionResults();
  renderCategories();
  const matches = state.data.topics.filter(t => (!state.group || t.group_id === state.group) && queryMatches(t));
  const art = CATEGORY_ART[state.group];
  $('#results-heading').textContent = art ? art.label : '主題一覽';
  $('#selection-label').textContent = art ? state.data.groups.find(g => g.id === state.group).title : '挑一題，把政策聊清楚';
  $('#result-count').textContent = `${matches.length} 個主題${state.query ? ` · 搜尋「${state.query}」` : ''}`;
  $('#all-topics').classList.toggle('active', !state.group && !state.query);
  const list = $('#topic-list'); list.replaceChildren();
  for (const topic of matches.slice(0, state.visible)) {
    const card = element('button', 'topic-card'); card.type = 'button'; card.dataset.topic = topic.id;
    card.style.setProperty('--category-color', CATEGORY_ART[topic.group_id].color);
    const category = element('span', 'topic-category', CATEGORY_ART[topic.group_id].label);
    if (topic.scope === 'public_issue') category.append(element('span', 'topic-scope', '公共議題觀點'));
    const title = element('span', 'topic-title', topic.title); title.setAttribute('role', 'heading'); title.setAttribute('aria-level', '3');
    const bottom = element('span', 'topic-bottom');
    const sourceText = topic.official.length && topic.interview.length ? '官方政策＋訪談' : topic.official.length ? '官方政策' : '訪談／活動內容';
    const action = element('strong', '', '看說明與摘要'); action.append(element('span', '', '↗'));
    bottom.append(element('span', '', sourceText), action);
    card.append(category, title, element('span', 'topic-intro', topic.intro), bottom);
    card.addEventListener('click', () => openTopic(topic.id)); list.append(card);
  }
  $('#empty-state').hidden = matches.length !== 0;
  $('#load-more').hidden = state.visible >= matches.length;
  $('#load-more').firstChild.textContent = `再看 ${Math.min(PAGE_SIZE, matches.length - state.visible)} 個主題 `;
}

function sourceLink(url, title) {
  const link = element('a', '', title); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function renderParagraphs(selector, paragraphs, empty, topic) {
  const host = $(selector); host.replaceChildren();
  if (!paragraphs.length) { host.append(element('p', 'no-source', empty)); return; }
  for (const paragraph of paragraphs) {
    const block = element('div', 'content-paragraph'); block.append(element('p', '', paragraph.text));
    const links = element('div', 'paragraph-sources');
    for (const url of paragraph.source_urls) {
      const source = topic.sources.find(s => s.url === url); links.append(sourceLink(url, `${source?.title || '原文'} ↗`));
    }
    block.append(links); host.append(block);
  }
}

function decodeUrl(url) { try { return decodeURI(url); } catch { return url; } }
function updatePostState() {
  const value = $('#share-post').value;
  const expected = state.topic.share.source_urls.map(decodeUrl);
  const found = (value.match(/https:\/\/[^\s]+/g) || []).map(decodeUrl);
  const sourcesPresent = found.length === expected.length && expected.every(url => found.includes(url));
  const withinLimit = value.length <= 500;
  $('#character-count').textContent = `${value.length} / 500 字元`;
  $('#share-issue').textContent = !withinLimit ? '這段超過500字元，刪短一點再複製。' : !sourcesPresent ? '原文出處要一起帶走，請保留來源連結。' : '';
  $('#copy-post').disabled = !withinLimit || !sourcesPresent;
  $('#copy-status').textContent = '';
  if (dialog.open) fitPost();
}

function fitPost() {
  const field = $('#share-post'); field.style.height = 'auto';
  field.style.height = `${Math.min(900, Math.max(280, field.scrollHeight + 2))}px`;
}

function openTopic(id, updateAddress = true) {
  const topic = state.data.topics.find(t => t.id === id); if (!topic) return;
  state.topic = topic; clearTimeout(state.copyTimer);
  $('#detail-group').textContent = `${CATEGORY_ART[topic.group_id].label} / ${topic.group_title}`;
  $('#detail-title').textContent = topic.title; $('#detail-intro').textContent = topic.intro;
  $('#detail-scope').hidden = topic.scope !== 'public_issue';
  renderParagraphs('#official-content', topic.official, '這一題目前的整理依據來自訪談／活動內容。', topic);
  renderParagraphs('#interview-content', topic.interview, '這一題目前的整理依據來自官方政策頁。', topic);
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
    state.group = data.groups.some(g => g.id === group) ? group : ''; state.query = (params.get('q') || '').slice(0, 150);
    $('#topic-query').value = state.query;
    $('#topic-count').textContent = data.topics.length; $('#all-count').textContent = data.topics.length; $('#group-count').textContent = data.groups.length;
    document.querySelectorAll('.snapshot-date').forEach(node => { node.textContent = dateLabel(data.source_snapshot_date); });
    render(); if (params.has('topic')) openTopic(params.get('topic'), false);
  } catch {
    $('#categories').replaceChildren(); $('#categories').setAttribute('aria-busy', 'false');
    $('#load-error').hidden = false; $('#result-count').textContent = '主題暫時還沒載入';
  } finally { clearTimeout(timeout); }
}

$('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  $('#topic-query').blur(); $('#results-heading').focus({ preventScroll: true });
  const destination = state.query.trim() ? $('#search-form') : results;
  destination.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});
$('#topic-query').addEventListener('input', event => { state.query = event.target.value; state.group = ''; state.visible = PAGE_SIZE; render(); setAddress(); });
function clearFilters() { state.query = ''; state.group = ''; state.visible = PAGE_SIZE; $('#topic-query').value = ''; render(); setAddress(); }
$('#all-topics').addEventListener('click', clearFilters); $('#clear-search').addEventListener('click', clearFilters);
$('#load-more').addEventListener('click', () => { state.visible += PAGE_SIZE; render(); });
$('#retry-load').addEventListener('click', loadData); $('#close-topic').addEventListener('click', closeTopic);
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeTopic(); } });
dialog.addEventListener('close', () => {
  const previous = state.topic; state.topic = null;
  if (!previous) return;
  if (history.state?.pumaTopicId === previous.id) history.back(); else setAddress('');
});
$('#share-post').addEventListener('input', updatePostState); $('#restore-post').addEventListener('click', () => { $('#share-post').value = state.topic.share.text; updatePostState(); });
$('#copy-post').addEventListener('click', copyPost);
window.addEventListener('popstate', () => {
  if (!state.data) return; const params = new URLSearchParams(location.search);
  state.group = state.data.groups.some(g => g.id === params.get('group')) ? params.get('group') : '';
  state.query = (params.get('q') || '').slice(0, 150); $('#topic-query').value = state.query; state.visible = PAGE_SIZE; render();
  if (params.has('topic')) openTopic(params.get('topic'), false);
  else if (dialog.open) { state.topic = null; dialog.close(); }
});
for (let i = 0; i < 15; i++) $('#categories').append(element('div', 'category-skeleton'));
loadData();
