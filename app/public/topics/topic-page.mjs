import { startAnalytics } from './analytics-client.mjs';
import { loadTurnstileScript } from './turnstile-loader.mjs';
import { buildSummaryCopy, copyTextFallback } from './summary-copy.mjs';

const $ = (selector) => document.querySelector(selector);
const main = $('#topic-page');
if (main) {
  const topicId = main.dataset.topicId || '';
  const title = $('#detail-title')?.textContent || '';
  const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
  const summary = $('#share-post');
  const summaryText = summary?.textContent || '';
  const summaryCopy = buildSummaryCopy(title, summaryText);
  if ($('#character-count')) $('#character-count').textContent = `${summaryCopy.length} / 500 字元（含標題與來源網址）`;
  const reportForm = $('#report-form');
  let configPromise = null;
  let turnstileToken = '';
  let turnstileWidget = null;
  let copyTimer = null;
  let linkTimer = null;
  let analytics = { enabled: false, send: () => false };

  const reportSources = () => [...(summary?.querySelectorAll('a.summary-source') || [])]
    .map((a) => `- ${a.textContent}\n  ${a.href}`);
  const reportText = () => [
    '【Puma政策筆記 錯誤回報】', `題目：${title}（${topicId}）`, `頁面：${canonical}`,
    `問題類型：${$('#report-type')?.value || ''}`, `說明：${$('#report-note')?.value.trim() || '（未填）'}`,
    `資料版本：來源擷取 ${main.dataset.sourceSnapshotDate || ''}／內容更新 ${main.dataset.contentUpdated || ''}`,
    `短摘要字元數（含網址）：${summaryText.length}／500`, '本題來源：', ...reportSources(),
  ].join('\n');

  function safeStatus(node, text) { if (node) node.textContent = text; }
  async function getReportConfig() {
    if (!configPromise) configPromise = (async () => {
      try {
        const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
        const config = response.ok ? await response.json() : {};
        const result = { open: config.reportsOpen === true, siteKey: config.turnstileSiteKey || null, analyticsEnabled: config.analyticsEnabled === true, webAnalyticsToken: config.webAnalyticsToken, analyticsHost: config.analyticsHost || 'puma-note.pages.dev' };
        if (result.analyticsEnabled) analytics = startAnalytics(result, { page: 'topic', topicId });
        return result;
      } catch { return { open: false, siteKey: null }; }
    })();
    return configPromise;
  }
  async function prepareSend() {
    const config = await getReportConfig();
    const send = $('#report-send'); const status = $('#report-turnstile-status');
    if (!send) return;
    if (!config.open) { send.hidden = true; safeStatus(status, '問題回報目前未開放；你可以改按「複製回報內容」。'); return; }
    if (!config.siteKey) { send.hidden = true; safeStatus(status, '網頁驗證尚未設定，暫時無法直接送出；你可以改按「複製回報內容」。'); return; }
    send.hidden = false;
    if (turnstileWidget !== null) { send.disabled = !turnstileToken; return; }
    send.disabled = true; safeStatus(status, '正在載入網頁驗證…');
    try {
      await loadTurnstileScript();
      const compact = $('#report-turnstile').getBoundingClientRect().width < 320;
      const widget = window.turnstile.render('#report-turnstile', {
        sitekey: config.siteKey, action: 'report', size: compact ? 'compact' : 'normal',
        callback: (token) => { turnstileToken = token; send.disabled = false; safeStatus(status, ''); },
        'expired-callback': () => { turnstileToken = ''; send.disabled = true; safeStatus(status, '網頁驗證已逾時，請重新完成驗證。'); },
        'error-callback': () => { turnstileToken = ''; send.disabled = true; safeStatus(status, '網頁驗證失敗，請重新載入後再試；也可以改按「複製回報內容」。'); },
      });
      if (widget == null) throw new Error('Turnstile render failed');
      turnstileWidget = widget;
    } catch { send.hidden = true; send.disabled = false; safeStatus(status, '網頁驗證載入失敗或逾時，請稍後重試；也可以改按「複製回報內容」。'); }
  }

  async function copyText(value, failureNode, failureMessage, fallback) {
    let timer;
    try {
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 1600); }),
      ]);
      return true;
    } catch {
      try {
        const copied = fallback();
        if (!copied) safeStatus(failureNode, failureMessage);
        return copied;
      } catch { safeStatus(failureNode, failureMessage); return false; }
    } finally { clearTimeout(timer); }
  }
  function selectSummary() {
    return copyTextFallback(summaryCopy);
  }
  function selectLink() {
    const field = document.createElement('textarea');
    field.value = canonical; field.readOnly = true;
    field.style.position = 'fixed'; field.style.left = '-10000px'; field.style.top = '0';
    document.body.append(field);
    try { field.select(); return document.execCommand('copy'); }
    finally { field.remove(); }
  }
  $('#copy-post')?.addEventListener('click', async () => {
    const button = $('#copy-post'); const status = $('#copy-status');
    if (summaryCopy.length > 500 || !summary) { safeStatus(status, '標題與摘要超過 500 字元，無法複製。'); return; }
    const ok = await copyText(summaryCopy, status, '無法自動複製，請選取標題與上方摘要後使用瀏覽器複製功能。', selectSummary);
    if (!ok) return;
    analytics.send('summary_copy', { page: 'topic', topicId });
    const label = button.querySelector('span'); if (label) label.textContent = '內容已複製';
    safeStatus(status, '標題、摘要與來源已複製。'); clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { if (label) label.textContent = '複製標題、摘要與來源'; }, 1600);
  });
  $('#copy-link')?.addEventListener('click', async () => {
    const button = $('#copy-link'); const status = $('#link-copy-status');
    const ok = await copyText(canonical, status, '無法自動複製連結，請複製網址列中的網址。', selectLink);
    if (!ok) return;
    analytics.send('link_copy', { page: 'topic', topicId });
    const label = button.querySelector('span'); if (label) label.textContent = '連結已複製';
    safeStatus(status, '本題連結已複製。'); clearTimeout(linkTimer);
    linkTimer = setTimeout(() => { if (label) label.textContent = '複製本題連結'; }, 1600);
  });
  summary?.querySelectorAll('a.summary-source').forEach((link) => link.addEventListener('click', () => {
    let sourceType = 'other';
    try {
      const host = new URL(link.href).hostname.toLowerCase();
      if (host === 'puma.taipei' || host.endsWith('.puma.taipei')) sourceType = 'official';
      else if (host === 'puma-hub.pages.dev' || host.endsWith('.puma-hub.pages.dev')) sourceType = 'interview';
    } catch { /* ignore invalid URLs */ }
    analytics.send('source_click', { page: 'topic', topicId, sourceType });
  }));
  $('#open-report')?.addEventListener('click', async () => {
    if (!reportForm) return;
    reportForm.hidden = !reportForm.hidden;
    $('#open-report').setAttribute('aria-expanded', String(!reportForm.hidden));
    if (!reportForm.hidden) {
      await prepareSend(); $('#report-type')?.focus();
    }
  });
  $('#report-copy')?.addEventListener('click', async () => {
    const status = $('#report-status');
    const ok = await copyText(reportText(), status, '無法自動複製回報內容，請手動選取回報欄位。', () => {
      const box = $('#report-note'); if (!box) return false;
      box.value = reportText(); box.focus(); box.select(); return document.execCommand('copy');
    });
    if (ok) safeStatus(status, '回報內容已複製。');
  });
  $('#report-send')?.addEventListener('click', async () => {
    const status = $('#report-status'); const send = $('#report-send');
    const config = await getReportConfig();
    if (!config.open || reportForm?.hidden) return;
    if (config.siteKey && !turnstileToken) { safeStatus(status, '請先完成上方的網頁驗證。'); return; }
    if (send.disabled) return;
    send.disabled = true; safeStatus(status, '送出中…');
    let failureMessage = '回報暫時無法送出。你也可以改按「複製回報內容」。';
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        topicId, type: $('#report-type')?.value || '', note: $('#report-note')?.value || '',
        contentVersion: main.dataset.contentUpdated || main.dataset.sourceSnapshotDate || '',
        website: $('#report-website')?.value || '', turnstileToken,
      }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages = { RATE_LIMITED: '送出得有點密集，請稍後再試。', VERIFICATION_REQUIRED: '請重新完成網頁驗證再送出。', VERIFICATION_FAILED: '網頁驗證已失效，請重新完成驗證。', INVALID_INPUT: '請確認問題類型與說明，或重新開啟這一題。', INPUT_TOO_LONG: '說明太長，請縮短至300字以內。' };
        failureMessage = messages[data?.error?.code] || failureMessage;
        throw new Error('send failed');
      }
      safeStatus(status, data.duplicate ? '相同內容的回報已收到，會合併核對，不必重複送出。' : `已收到回報，編號 ${String(data.id || '')}。謝謝你協助核對。`);
      $('#report-note').value = '';
    } catch {
      safeStatus(status, failureMessage);
    } finally {
      send.disabled = true; turnstileToken = '';
      if (window.turnstile && turnstileWidget !== null) { try { window.turnstile.reset(turnstileWidget); } catch { /* ignored */ } }
    }
  });
  getReportConfig().catch(() => {});
}
