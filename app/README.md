# Puma政策筆記

目前本機／分支版本已改為「既有主題搜尋」：民眾輸入問題後，在瀏覽器比對86個主題，顯示事先整理好的摘要與來源，不產生新回答。

**這批改動尚未部署。** 公開網址仍是 https://puma-note.pages.dev ，不能把本機的API停用視為線上已停用。原線上內容版本仍以 `content/policy-topics/publication.json` 為準。

## 公開端的運作方式

- 15類、86張主題卡直接展開；問題／關鍵字搜尋結果放在查詢框下方。
- 以標題、主題關鍵字、官方與訪談內容做加權詞彙比對，支援部分常用同義詞及臺／台正規化；這是詞彙搜尋，不是LLM語意理解。
- 搜尋排序回傳原本的主題物件，短摘要與引用逐字維持原樣。找不到時顯示空結果，不另寫答案。
- 完整可複製內容含換行、標點及原始網址不超過500字元；保留編輯、還原與來源完整性守門。
- 公開頁面不呼叫OpenAI、Cloudflare AI Search、Workers AI或Turnstile。問題不會送到AI服務；網址仍可保留查詢與主題，支援返回及深連結。
- `/api/generate`、舊`/api/search`回410；`/api/config`回報`static-topic-search`及`generationEnabled:false`。不是只隱藏表單。

主要檔案：`public/topics/`，搜尋模組為 `topic-search.mjs`。主題來源為 `content/policy-topics/expanded-topics.json`，透過 `scripts/export-public-topics.mjs` 匯出公開JSON；內部校讀註記不進入公開檔案。本輪沒有修改政策、訪談或摘要正文。

## 本機預覽

需要Node.js 22.13以上，沿用既有lockfile安裝：

```sh
cd app
npm ci
npm run dev -- --ip 127.0.0.1 --port 8890 --inspector-port 8891
```

`predev`會先建置靜態包。預覽使用專案根目錄的 `pages-static/wrangler.jsonc`，不是 `app/wrangler.jsonc`。專用預覽腳本從獨立Pages目錄啟動，避免混入原Worker的D1／R2設定；不需要OpenAI金鑰。

## 建置與驗證

```sh
npm run build:static
npm test
```

- `static-dist/`：新Pages站台的產物，HTML／CSS／JS／JSON直接提供靜態內容，`_routes.json`僅讓`/api/*`進入輕量函式。根目錄與`/topics/`都能直接開啟主題館。
- `npm run build`：保留原Worker發行所需的Vite產物及型別檢查，原首頁現在只導向主題館。
- `npm run dev:worker`：僅供原Worker退役路由的本機驗證。
- `worker/index.ts`：只提供靜態入口、410退役API與健康資訊；沒有OpenAI／AI Search／DB查詢依賴。

`scripts/dev.mjs`及原生成、檢索模組保留為歷史／內部工具和既有測試資料，已不是`npm run dev`或正式Worker的入口。請勿執行舊的真實模型smoke腳本作為這版驗收。

## Cloudflare與費用邊界

新公開架構採Cloudflare Pages靜態託管，搜尋在瀏覽器完成，不使用任何模型token。靜態資產請求依Cloudflare文件免費且不限量；API錯誤及健康路由仍屬Functions／Workers用量，應按帳號方案計算，不能將整個帳號說成永遠零費用。

Cloudflare AI Search不是無限制免費：官方列出每月包含1,000次語意及1,000次全文查詢，2026-12-01開始計費，因此此版不把它放在公開搜尋路徑。沒有改動帳號方案、移除遠端原始資料、刪除Secret或部署。

部署有兩部分，均留待後續發布：

1. 以根目錄 `pages-static/wrangler.jsonc` 和 `app/static-dist` 更新 `puma-note`，取代原先的Pages gateway；不是再執行舊的gateway建置腳本。
2. 更新原Worker `puma-policy-v1` 的退役程式，確保舊Workers網址也不再保留公開生成端點；只換Pages畫面不足以停用舊後端。

操作與驗證詳見 `docs/2026-11-07-static-topic-search.md` 及 `docs/cloudflare-setup.md`。

## 資料與研究

來源擷取、內容修訂與網站部署是三個不同日期，頁面分開顯示。原始下載資料在上層 `00_來源資料/`，保留不變。

- 研究入口：`content/policy-topics/markdown/2026-11-07_研究整理/README.md`。
- 內部來源查核報告：`content/policy-topics/revisions/2026-11-07-summary-500/review/review-report.md`，結果不等於平台用途核准。
- 官方政策：https://puma.taipei/policies
- 訪談／活動整理：https://puma-hub.pages.dev/#all

民間獨立整理，並非官方網站。資料館的內容須保持中立、可追溯；沒有新增公開問答生成、分眾說服、自動發文或訊息分發。
