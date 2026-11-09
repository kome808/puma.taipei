import { REPORT_EMAIL } from './site-config.js';
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

  const reportSources = () => [...(summary?.querySelectorAll('a.summary-source') || [])]
    .map((a) => `- ${a.textContent}\n  ${a.href}`);
  const reportText = () => [
    '【Puma政策筆記 錯誤回報】', `題目：${title}（${topicId}）`, `頁面：${canonical}`,
    `問題類型：${$('#report-type')?.value || ''}`, `說明：${$('#report-note')?.value.trim() || '（未填）'}`,
    `資料版本：來源擷取 ${main.dataset.sourceSnapshotDate || ''}／內容更新 ${main.dataset.contentUpdated || ''}`,
    `短摘要字元數（含網址）：${summaryText.length}／500`, '本題來源：', ...reportSources(),
  ].join('\n');

  function safeStatus(node, text) { if (node) node.textContent = text; }
  function prepareMail() {
    const mail = $('#report-mail');
    if (!mail) return;
    mail.hidden = !REPORT_EMAIL;
    if (REPORT_EMAIL) mail.href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`回報：${title}（${topicId}）`)}&body=${encodeURIComponent(reportText())}`;
  }
  async function getReportConfig() {
    if (!configPromise) configPromise = (async () => {
      try {
        const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
        const config = response.ok ? await response.json() : {};
        return { open: config.reportsOpen === true, siteKey: config.turnstileSiteKey || null };
      } catch { return { open: false, siteKey: null }; }
    })();
    return configPromise;
  }
  function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true; script.onload = resolve; script.onerror = reject; document.head.append(script);
    });
  }
  async function prepareSend() {
    const config = await getReportConfig();
    const send = $('#report-send');
    if (!send) return;
    send.hidden = !config.open;
    if (!config.open || !config.siteKey || turnstileWidget !== null) return;
    try {
      await loadTurnstileScript();
      turnstileWidget = window.turnstile.render('#report-turnstile', {
        sitekey: config.siteKey, action: 'report',
        callback: (token) => { turnstileToken = token; },
        'expired-callback': () => { turnstileToken = ''; },
        'error-callback': () => { turnstileToken = ''; },
      });
    } catch { send.hidden = true; }
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
    const label = button.querySelector('span'); if (label) label.textContent = '內容已複製';
    safeStatus(status, '標題、摘要與來源已複製。'); clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { if (label) label.textContent = '複製標題、摘要與來源'; }, 1600);
  });
  $('#copy-link')?.addEventListener('click', async () => {
    const button = $('#copy-link'); const status = $('#link-copy-status');
    const ok = await copyText(canonical, status, '無法自動複製連結，請複製網址列中的網址。', selectLink);
    if (!ok) return;
    const label = button.querySelector('span'); if (label) label.textContent = '連結已複製';
    safeStatus(status, '本題連結已複製。'); clearTimeout(linkTimer);
    linkTimer = setTimeout(() => { if (label) label.textContent = '複製本題連結'; }, 1600);
  });
  $('#open-report')?.addEventListener('click', async () => {
    if (!reportForm) return;
    reportForm.hidden = !reportForm.hidden;
    $('#open-report').setAttribute('aria-expanded', String(!reportForm.hidden));
    if (!reportForm.hidden) {
      prepareMail(); await prepareSend(); $('#report-type')?.focus();
    }
  });
  for (const selector of ['#report-type', '#report-note']) $(selector)?.addEventListener('input', prepareMail);
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
    send.disabled = true; safeStatus(status, '送出中…');
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        topicId, type: $('#report-type')?.value || '', note: $('#report-note')?.value || '',
        contentVersion: main.dataset.contentUpdated || main.dataset.sourceSnapshotDate || '',
        website: $('#report-website')?.value || '', turnstileToken,
      }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('send failed');
      safeStatus(status, `已收到回報，編號 ${String(data.id || '')}。謝謝你協助核對。`);
      $('#report-note').value = '';
    } catch {
      safeStatus(status, '回報暫時無法送出。你也可以改按「複製回報內容」。');
    } finally {
      send.disabled = false; turnstileToken = '';
      if (window.turnstile && turnstileWidget !== null) { try { window.turnstile.reset(turnstileWidget); } catch { /* ignored */ } }
    }
  });
}
