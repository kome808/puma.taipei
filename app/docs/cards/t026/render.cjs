// 將 card.html 截圖成 1080×1350 PNG。
// 用法（在 app/ 目錄下）：node docs/cards/t026/render.cjs
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// app/node_modules 的 playwright 版本可能和系統預裝的 Chromium 不符；
// 依序嘗試本地與全域安裝的 playwright，挑瀏覽器檔案確實存在的那一個。
function loadChromium() {
  const candidates = ['playwright'];
  try { candidates.push(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch {}
  for (const id of candidates) {
    try {
      const { chromium } = require(id);
      if (fs.existsSync(chromium.executablePath())) return chromium;
    } catch {}
  }
  return require('playwright').chromium;
}
const chromium = loadChromium();

(async () => {
  const dir = __dirname;
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1,
  });
  await page.goto('file://' + path.join(dir, 'card.html'));
  await page.evaluate(() => document.fonts.ready);

  // 版面檢查：任何元素超出畫布或 .page 內容溢出時印出警告
  const issues = await page.evaluate(() => {
    const out = [];
    const W = 1080, H = 1350;
    const pg = document.querySelector('.page');
    if (pg.scrollHeight > pg.clientHeight + 1) out.push(`.page 內容溢出 ${pg.scrollHeight - pg.clientHeight}px`);
    for (const el of document.querySelectorAll('.page *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > W - 20 || r.bottom > H - 20 || r.left < 0 || r.top < 0) {
        out.push(`${el.tagName.toLowerCase()}.${el.className || ''} 超出安全邊界：${JSON.stringify({ l: r.left, t: r.top, r: r.right, b: r.bottom })}`);
      }
    }
    const foot = document.querySelector('.foot').getBoundingClientRect();
    const tl = document.querySelector('.tl').getBoundingClientRect();
    out.push(`資訊：時間軸底 ${Math.round(tl.bottom)}px，頁尾頂 ${Math.round(foot.top)}px，頁尾底 ${Math.round(foot.bottom)}px`);
    return out;
  });
  issues.forEach((m) => console.log(m));

  await page.screenshot({ path: path.join(dir, 't026-card.png'), clip: { x: 0, y: 0, width: 1080, height: 1350 } });
  await browser.close();
  console.log('已輸出 t026-card.png');
})();
