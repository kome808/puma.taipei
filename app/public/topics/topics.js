import { CATEGORY_ART } from './categories.js';
import { REPORT_EMAIL } from './site-config.js';
import { requestBasicSearch, requestSemanticSearch } from './semantic-search-client.mjs';

const $ = (selector) => document.querySelector(selector);
const state = { data: null, group: '', query: '', topic: null, copyTimer: null, searchMode: 'basic', resultIds: null, searchSubmitted: false, searchBusy: false, searchMessage: '', searchController: null, semanticSearchEnabled: false };
const dialog = $('#topic-dialog');
const stack = $('#browse-stack');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dateLabel(date) { return String(date).replaceAll('-', '.'); }
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
  const open = element('span', 'topic-open'); open.append('看摘要與來源 ', element('b', '', '↗'));
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
  const semantic = state.searchMode === 'semantic';
  const successfulSearch = state.searchSubmitted && Array.isArray(state.resultIds);
  stack.classList.toggle('is-searching', searching && successfulSearch);
  const searchedTopics = state.searchSubmitted && Array.isArray(state.resultIds)
    ? state.resultIds.map((id) => state.data.topics.find((topic) => topic.id === id)).filter(Boolean)
    : [];
  const ranked = successfulSearch ? searchedTopics : state.data.topics;
  const matchesByGroup = new Map();
  for (const group of state.data.groups) {
    matchesByGroup.set(group.id, ranked.filter((t) => t.group_id === group.id));
  }
  renderCategories(matchesByGroup);

  const host = $('#topic-sections'); host.replaceChildren();
  let shown = 0;
  if (successfulSearch) {
    const matches = ranked.filter((topic) => !state.group || topic.group_id === state.group);
    shown = matches.length;
    if (shown) {
      const section = element('section', 'topic-group');
      const title = element('h3', '', '與問題相關的主題');
      title.id = 'search-results-heading';
      section.setAttribute('aria-labelledby', title.id);
      const grid = element('div', 'topic-grid');
      for (const topic of matches) grid.append(topicCard(topic));
      section.append(title, grid); host.append(section);
    }
  } else for (const group of state.data.groups) {
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
  if (searching) parts.push(`查詢：「${state.query.trim()}」`);
  $('#result-count').textContent = searching && !successfulSearch
    ? (state.searchBusy ? '正在搜尋，仍可瀏覽下方主題。' : '尚未取得搜尋結果，可先瀏覽下方主題。')
    : successfulSearch ? `${shown} 個主題符合（${parts.join('、')}）`
      : parts.length ? `${shown} 個主題符合（${parts.join('、')}）` : `全部 ${total} 個主題，分成 ${state.data.groups.length} 類`;
  $('#clear-filters').hidden = !state.group && !searching;
  $('#all-topics').classList.toggle('active', !state.group && !searching);
  const waitingForSubmit = searching && !successfulSearch && !state.searchBusy && !state.searchMessage;
  $('#empty-state').hidden = !successfulSearch || shown !== 0;
  $('#empty-state h3').textContent = '沒有找到相關主題。';
  $('#empty-state p').textContent = '試著換個方式描述問題，或清除條件看全部主題。';
  const status = $('#semantic-status');
  $('#search-form button[type="submit"]').disabled = state.searchBusy;
  status.hidden = !state.searchMessage && !waitingForSubmit;
  status.textContent = state.searchMessage || (semantic ? '輸入問題並按「搜尋」，才會送出語意搜尋。' : '輸入關鍵字並按「搜尋」，才會查詢主題。');
  status.classList.toggle('is-loading', state.searchBusy);
}

function cancelSearch() {
  state.searchController?.abort(); state.searchController = null;
  state.searchBusy = false;
}

async function submitSearch() {
  if (state.searchBusy) return;
  cancelSearch(); state.resultIds = null; state.searchSubmitted = false; state.searchMessage = '';
  if (state.searchMode === 'semantic' && !state.semanticSearchEnabled) {
    state.searchMessage = '語意搜尋尚未啟用，基本搜尋可照常使用。'; render(); return;
  }
  const query = state.query.trim();
  if (!query) { render(); return; }
  const controller = new AbortController(); state.searchController = controller;
  state.searchBusy = true; state.searchMessage = '正在搜尋既有主題…'; render();
  try {
    const request = state.searchMode === 'semantic' ? requestSemanticSearch : requestBasicSearch;
    const result = await request(query, state.data.semantic_corpus_version, { signal: controller.signal });
    if (state.searchController !== controller) return;
    state.resultIds = [...new Set(result.topicIds)].filter((id) => state.data.topics.some((topic) => topic.id === id));
    state.searchSubmitted = true;
    state.searchMessage = state.resultIds.length ? `${state.searchMode === 'semantic' ? '語意' : '基本'}搜尋找到 ${state.resultIds.length} 個既有主題。` : `${state.searchMode === 'semantic' ? '語意' : '基本'}搜尋沒有找到相關主題。`;
  } catch (error) {
    if (state.searchController !== controller || controller.signal.aborted) return;
    state.searchMessage = error.message || '搜尋目前無法使用，分類瀏覽仍可使用。';
  } finally {
    if (state.searchController === controller) { state.searchBusy = false; state.searchController = null; render(); }
  }
}

function decodeUrl(url) { try { return decodeURI(url); } catch { return url; } }
function renderSummary(topic) {
  const host = $('#share-post'); host.replaceChildren();
  const sourceUrls = new Set(topic.share.source_urls.map(decodeUrl));
  for (const part of topic.share.text.split(/(https:\/\/[^\s]+)/g)) {
    if (sourceUrls.has(decodeUrl(part))) {
      const link = element('a', 'summary-source', part);
      link.href = part; link.target = '_blank'; link.rel = 'noopener noreferrer';
      host.append(link);
    } else host.append(document.createTextNode(part));
  }
  const value = topic.share.text;
  const found = (value.match(/https:\/\/[^\s]+/g) || []).map(decodeUrl);
  const sourcesPresent = found.length === sourceUrls.size && found.every((url) => sourceUrls.has(url));
  const valid = value.length <= 500 && sourcesPresent;
  $('#character-count').textContent = `${value.length} / 500 字元（含來源網址）`;
  $('#share-issue').textContent = valid ? '' : '摘要資料暫時無法複製，請用下方回報功能通知維護者。';
  $('#copy-post').disabled = !valid;
  $('#copy-status').textContent = '';
}

function openTopic(id, updateAddress = true) {
  const topic = state.data.topics.find((t) => t.id === id); if (!topic) return;
  state.topic = topic; clearTimeout(state.copyTimer);
  $('#detail-group').textContent = topic.group_title;
  $('#detail-title').textContent = topic.title;
  $('#detail-scope').hidden = true;
  const badges = $('#detail-badges'); badges.replaceChildren(...sourceBadges(topic).childNodes);
  renderSummary(topic);
  $('#copy-post span').textContent = '複製摘要與來源';
  resetReport();
  if (!dialog.open) dialog.showModal(); dialog.scrollTop = 0;
  $('#close-topic').focus({ preventScroll: true });
  if (updateAddress) setAddress(id, true);
}
function reportText() {
  const topic = state.topic; const note = $('#report-note').value.trim();
  const lines = ['【Puma政策筆記 錯誤回報】', `題目：${topic.title}（${topic.id}）`, `頁面：${location.origin}/topics/?topic=${topic.id}`,
    `問題類型：${$('#report-type').value}`, `說明：${note || '（未填）'}`, `資料版本：來源擷取 ${state.data.source_snapshot_date}／內容更新 ${state.data.content_updated || state.data.source_snapshot_date}`,
    `短摘要字元數（含網址）：${topic.share.text.length}／500`, '本題來源：', ...topic.sources.map((s) => `- ${s.title}\n  ${s.url}`)];
  return lines.join('\n');
}
function resetReport() {
  $('#report-form').hidden = true; $('#open-report').setAttribute('aria-expanded', 'false'); $('#report-note').value = ''; $('#report-status').textContent = '';
  $('#report-type').selectedIndex = 0;
}
function prepareMail() {
  const mail = $('#report-mail');
  if (!REPORT_EMAIL) { mail.hidden = true; return; }
  mail.hidden = false;
  mail.href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`回報：${state.topic.title}（${state.topic.id}）`)}&body=${encodeURIComponent(reportText())}`;
}
let reportConfig = null; let reportConfigPromise = null; let turnstileToken = ''; let turnstileWidget = null;
async function loadReportConfig() {
  if (reportConfig) return reportConfig;
  if (!reportConfigPromise) reportConfigPromise = (async () => {
    try {
      const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
      const config = response.ok ? await response.json() : {};
      reportConfig = { open: Boolean(config.reportsOpen), siteKey: config.turnstileSiteKey || null, semanticSearchEnabled: config.semanticSearchEnabled === true };
    } catch { reportConfig = { open: false, siteKey: null, semanticSearchEnabled: false }; }
    return reportConfig;
  })();
  return reportConfigPromise;
}
function updateSemanticSearchAvailability(enabled) {
  state.semanticSearchEnabled = enabled === true;
  const option = $('input[name="search-mode"][value="semantic"]');
  option.disabled = !state.semanticSearchEnabled;
  $('#semantic-mode-status').hidden = state.semanticSearchEnabled;
}
function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    script.onload = resolve; script.onerror = reject; document.head.append(script);
  });
}
async function prepareSend() {
  const config = await loadReportConfig();
  $('#report-send').hidden = !config.open;
  if (!config.open || !config.siteKey || turnstileWidget !== null) return;
  try {
    await loadTurnstileScript();
    turnstileWidget = window.turnstile.render('#report-turnstile', { sitekey: config.siteKey, action: 'report', callback: (token) => { turnstileToken = token; }, 'expired-callback': () => { turnstileToken = ''; }, 'error-callback': () => { turnstileToken = ''; } });
  } catch { $('#report-send').hidden = true; }
}
async function sendReport() {
  const config = await loadReportConfig();
  const status = $('#report-status');
  if (config.siteKey && !turnstileToken) { status.textContent = '請先完成上方的網頁驗證。'; return; }
  $('#report-send').disabled = true; status.textContent = '送出中…';
  try {
    const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      topicId: state.topic.id, type: $('#report-type').value, note: $('#report-note').value, contentVersion: state.data.content_updated || state.data.source_snapshot_date,
      website: $('#report-website').value, turnstileToken }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || '送出失敗');
    status.textContent = `已收到回報，編號 ${data.id}。謝謝你協助核對。`; $('#report-note').value = '';
  } catch (error) {
    status.textContent = `${error.message || '送出失敗'}。你也可以改按「複製回報內容」。`;
  } finally {
    $('#report-send').disabled = false; turnstileToken = '';
    if (window.turnstile && turnstileWidget !== null) { try { window.turnstile.reset(turnstileWidget); } catch { /* ignore */ } }
  }
}
function closeTopic() { dialog.close(); }

async function copyPost() {
  if ($('#copy-post').disabled) return;
  const value = state.topic.share.text; let timer;
  try {
    await Promise.race([navigator.clipboard.writeText(value), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('clipboard deadline')), 1600); })]);
  } catch {
    const selection = window.getSelection();
    if (!selection) { $('#copy-status').textContent = '請選取上方文字，使用瀏覽器的複製功能。'; return; }
    const range = document.createRange(); range.selectNodeContents($('#share-post'));
    selection.removeAllRanges(); selection.addRange(range);
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
    loadReportConfig().then((config) => updateSemanticSearchAvailability(config.semanticSearchEnabled));
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

function clearFilters() { cancelSearch(); state.resultIds = null; state.searchSubmitted = false; state.searchMessage = ''; state.query = ''; state.group = ''; $('#topic-query').value = ''; render(); setAddress(''); }
$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault(); $('#topic-query').blur();
  submitSearch();
  $('#filter-status').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});
$('#topic-query').addEventListener('input', (event) => { cancelSearch(); state.resultIds = null; state.searchSubmitted = false; state.searchMessage = ''; state.query = event.target.value; render(); setAddress(''); });
document.querySelectorAll('input[name="search-mode"]').forEach((input) => input.addEventListener('change', (event) => {
  cancelSearch(); state.resultIds = null; state.searchSubmitted = false; state.searchMessage = '';
  state.searchMode = event.target.value; render();
}));
$('#all-topics').addEventListener('click', clearFilters); $('#clear-search').addEventListener('click', clearFilters); $('#clear-filters').addEventListener('click', clearFilters);
$('#retry-load').addEventListener('click', loadData); $('#close-topic').addEventListener('click', closeTopic);
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeTopic(); } });
dialog.addEventListener('close', () => {
  const previous = state.topic; state.topic = null;
  if (!previous) return;
  if (history.state?.pumaTopicId === previous.id) history.back(); else setAddress('');
});
$('#copy-post').addEventListener('click', copyPost);
$('#open-report').addEventListener('click', () => { const form = $('#report-form'); form.hidden = !form.hidden; $('#open-report').setAttribute('aria-expanded', String(!form.hidden)); prepareMail(); if (!form.hidden) { prepareSend(); $('#report-type').focus(); } });
$('#report-send').addEventListener('click', sendReport);
for (const id of ['#report-type', '#report-note']) $(id).addEventListener('input', prepareMail);
$('#report-copy').addEventListener('click', async () => {
  const text = reportText();
  try { await navigator.clipboard.writeText(text); $('#report-status').textContent = '回報內容已複製。'; }
  catch { const box = $('#report-note'); $('#report-status').textContent = '瀏覽器沒有允許自動複製，請手動選取下方文字。'; box.value = text; box.focus(); box.select(); }
});
window.addEventListener('popstate', () => {
  if (!state.data) return; cancelSearch(); state.resultIds = null; state.searchSubmitted = false; state.searchMessage = ''; const params = new URLSearchParams(location.search);
  state.group = state.data.groups.some((g) => g.id === params.get('group')) ? params.get('group') : '';
  state.query = (params.get('q') || '').slice(0, 150); $('#topic-query').value = state.query; render();
  if (params.has('topic')) openTopic(params.get('topic'), false);
  else if (dialog.open) { state.topic = null; dialog.close(); }
});
for (let i = 0; i < 15; i++) $('#categories').append(element('div', 'category-skeleton'));
loadData();
