# Cloudflare v1 設定與匯入

## 本機待發布：靜態主題搜尋

2026-11-07使用者選擇公開端不接OpenAI API，使用Cloudflare免費功能。已準備瀏覽器端的86題詞彙搜尋及純靜態Pages包；詳見 [靜態搜尋紀錄](2026-11-07-static-topic-search.md)。新設定在專案根目錄 `pages-static/wrangler.jsonc`，原 `app/pages-gateway/` 僅保留既有線上版本，不應再當成新版本發行入口。

**尚未部署。** 下方gateway／D1／AI Search敘述保留為既有線上資源與歷史紀錄；不能據本機退役程式就認定原公開API已停用。正式切換需發布新Pages靜態包及原Worker退役路由，並逐一核對新舊網址。

此檔記錄 `puma-policy-v1` 的隔離 Cloudflare 資源與可重複執行的匯入方式。2026-11-06 經使用者同意保存既有金鑰並公開部署，測試網址為 [puma-policy-v1.kome808.workers.dev](https://puma-policy-v1.kome808.workers.dev)。

## 目前公開入口：puma-note.pages.dev

2026-11-07 使用者選定 [puma-note.pages.dev](https://puma-note.pages.dev)，已建立同名 Cloudflare Pages Direct Upload 專案。Pages advanced-mode gateway 透過 `POLICY_BACKEND` Service Binding 連接既有 `puma-policy-v1`，所有頁面與 API 維持同一個新網址。沒有修改帳號共用的 Workers 子網域，也沒有搬移金鑰、資料庫或語料。

Pages 版本為 `848d4f40-6f6c-4f48-8f25-e92ea08ed913`，後端仍為 `90ec93aa-9cce-4b52-9861-907aa850ac5e`。此部署只有入口，不含尚未發布的本機文案、主題稿或生成指示修訂；`content/policy-topics/publication.json` 保留原內容版本紀錄。主題 JSON 與原 Workers 網址逐字相同。Pages `fail_open=false`，正式 hostname 以外的預覽入口回傳 404。

Gateway 先核對瀏覽器 Origin，再將允許的新 Origin 對應至後端既有 Origin；請求 URL 保留新 hostname，以供後端核對 Turnstile。既有 Managed widget 已在原允許網域外加上 `puma-note.pages.dev`，沒有換 key／Secret；後端 hostname、action、限額檢查均保留。

僅更新 Pages 入口時：

```sh
cd app
node --import tsx --test tests/pages-gateway.test.ts
node scripts/build-pages-gateway.mjs
cd pages-gateway
WRANGLER_LOG_PATH=/private/tmp/puma-pages-whoami.log ../node_modules/.bin/wrangler whoami
WRANGLER_LOG_PATH=/private/tmp/puma-pages-deploy.log ../node_modules/.bin/wrangler pages deploy ../pages-dist --project-name puma-note --branch main --no-bundle
```

Pages 使用獨立的 `pages-gateway/wrangler.jsonc` 與 `pages-dist`，不要上傳 `app/dist` 來替代入口部署。來源程式為 `pages-gateway/index.ts`，建置腳本為 `scripts/build-pages-gateway.mjs`。

驗證：全套 71 項測試通過；新網址首頁、主題頁、health/config 皆 200；原句「無限都更一開始的房子要怎樣來」經 AI Search 回傳 8 段且含 TODAY 訪談；外站 Origin 403、缺少驗證 token 的生成請求 403。390px 瀏覽器無水平溢出，獨立的真實 Turnstile 驗證成功，沒有送出 OpenAI 生成請求；尚未重做 iPhone Safari 實機驗收。首次部署後立即請求曾回 522，後續同網址首頁與 API 已正常。結果存於 `artifacts/pages-public-url-check.json`。

## 已建立的資源

| 服務 | 名稱／ID | 設定 |
| --- | --- | --- |
| Worker | `puma-policy-v1` | Workers Static Assets + API；`workers.dev` 公開測試版 |
| D1 | `puma-policy-v1` / `be2e70a9-032c-474d-9550-8e6b98cb5cd8` | primary location `APAC` |
| R2 | `puma-policy-v1-sources` | location `APAC`、Standard、default jurisdiction |
| AI Search | `default/puma-policy-v1` | managed upload-only built-in storage；`@cf/google/embeddinggemma-300m`；vector + keyword hybrid；`trigram` tokenizer；query rewrite 關閉；public endpoint 關閉 |
| Turnstile | `puma-policy-v1` widget | managed；僅允許公開測試網域；後端核對 hostname 及 `generate` action |

AI Search 的 EmbeddingGemma 是 Cloudflare Workers AI 模型，支援多語言內容；本專案的繁體中文政策文字使用 `trigram` 以保留不依賴空格的關鍵字比對。建立時狀態為 `waiting`；目前已上傳 98 份來源文件，且 98/98 items 已完成索引（`error=0`、`vectorsCount=1149`、dimensions=768）。

Wrangler OAuth 已確認登入 `kome808@gmail.com`，帳戶 ID 為 `4c10afbddf5fd32960496609cc2061d0`。本專案沒有保存任何 API key 或 secret。

`wrangler types --config wrangler.jsonc` 與實際部署均已辨識 `DB`、`SOURCES`、`AI_SEARCH` 三個 binding。

## Wrangler 設定

[`wrangler.jsonc`](../wrangler.jsonc) 綁定：

- Worker：`puma-policy-v1`，入口 `worker/index.ts`，compatibility date `2026-11-06`
- 靜態資產：`dist` → `ASSETS`；`run_worker_first=true`，由 Worker 先套用安全標頭與路由
- D1：`DB`
- R2：`SOURCES`
- AI Search：`AI_SEARCH` → `default/puma-policy-v1`
- 變數：`ENVIRONMENT=production`、`OPENAI_MODEL=gpt-6-luna`、`DAILY_GLOBAL_LIMIT=1000`
- `TURNSTILE_SITE_KEY` 已設為此網站的公開 sitekey；`ALLOWED_ORIGIN=https://puma-policy-v1.kome808.workers.dev`
- 加密 Secrets：`OPENAI_API_KEY`、`TURNSTILE_SECRET_KEY`、`RATE_LIMIT_SALT`；只核對名稱，不輸出或另存值

## D1 匯入

先建立 corpus 產物，再依序匯入 base schema、seed data、runtime schema。後兩者分離是為了讓 `worker/runtime-schema.sql` 可在 generated schema/data 之後套用。

```sh
cd app
node scripts/cloudflare-import-d1.mjs --dry-run
node scripts/cloudflare-import-d1.mjs --reset-corpus
```

預設尋找：

- base schema：`generated/schema.sql`
- seed data：`generated/data.sql`
- runtime schema：`worker/runtime-schema.sql`

也可用 `--schema`、`--data`、`--runtime-schema` 指定明確檔案。預設目標是 remote D1；本地驗證才加 `--local`。匯入程式使用 Wrangler 現有登入，不會讀取或輸出 key。

`--reset-corpus` 是明確的 corpus-only reset：會先刪除 `passage_fts`、`passages`、`sources`、`corpus_meta`，保留 `request_limits` 與 `generation_usage`，再匯入資料。當來源段落被移除或重整時應使用它，避免 upsert 留下舊段落。

2026-11-06 已完成 final remote D1 匯入驗證：`sources=98`、`passages=1561`、`passage_fts=1561`、`corpus_meta.version=2026-11-06-v1`。runtime 的 `generation_usage` 與 `request_limits` 在匯入時皆為 0；公開測試後會記錄用量與限額，不應重設這兩表。

## R2 與 AI Search 匯入

`cloudflare-import-sources.mjs` 將 `generated/corpus.json` 與 `generated/search-docs/**/*.md` 歸檔到 R2，並把每一份 Markdown 上傳到 managed AI Search built-in storage。R2 與 AI Search 都可重用既有 Wrangler OAuth；若執行環境已提供 `CLOUDFLARE_API_TOKEN` 則優先使用，否則腳本會以 piped `wrangler auth token --json` 取得 OAuth token，僅保留在 process memory，不輸出、不寫檔。上傳並行數固定不超過 4。

```sh
cd app
node scripts/cloudflare-import-sources.mjs --dry-run
node scripts/cloudflare-import-sources.mjs

# 若執行環境已有安全注入的 API token，也可使用：
# CLOUDFLARE_API_TOKEN='(由執行環境安全注入)' node scripts/cloudflare-import-sources.mjs
```

第一次匯入會跳過已存在的同 key item；需要明確重建時才使用 `--replace`（會先刪除相同 key 的 AI Search item）。`--wait` 會要求 API 在可能的等待預算內確認索引；完成後腳本會回報 queued/running/completed/error 統計。`--skip-r2`、`--skip-ai-search` 可分開驗證兩段流程。

查詢端應將 `ai_search_options.cache.enabled` 設為 `false`，並維持 `query_rewrite.enabled=false`；本次以 `retrieval_type=hybrid` 實際查詢「都市更新」與「水文化」均成功回傳結果，避免把使用者查詢交給 AI Gateway cache 或自動改寫。

2026-11-06 已完成 final R2 archive：`archive/2026-11-06-v1/corpus.json` 與 `archive/2026-11-06-v1/search-docs/` 下 98 份 Markdown 均已上傳並以 `--force` 覆寫最終版本。AI Search Items 同步結果為 `uploaded=98`、`skipped=0`，最後狀態為 `completed=98`、`error=0`。

## 參考文件

- [AI Search REST API](https://developers.cloudflare.com/ai-search/get-started/api/)
- [AI Search Items REST API](https://developers.cloudflare.com/ai-search/api/items/rest-api/)
- [AI Search Workers binding](https://developers.cloudflare.com/ai-search/api/instances/workers-binding/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [D1 database](https://developers.cloudflare.com/d1/reference/database-commands/)
- [R2 object commands](https://developers.cloudflare.com/r2/reference/wrangler-commands/)

## 公開測試與更新

公開 `/api/health` 與 `/api/config` 已確認 98 來源、1,561 段，`live=true`；運動與都更搜尋皆使用實際 AI Search。缺少驗證 token 的生成請求回傳 403。瀏覽器使用真實 Turnstile 與 Luna 完成產文；不使用測試 key 繞過正式驗證。

後續更新程式執行 `npm test`、`npm run build` 再 `npm run deploy`。僅調整程式不需重匯語料或重設 Secrets；需更新來源時才另行執行上述匯入流程。

## 手機驗證與重試

2026-11-06 公開版修正手機驗證逾時：SDK 在取得設定後預載入（30 秒載入界限）；每次查詢新建 widget，完成、失敗或取消都移除該次 widget，不沿用 reset／execute。一般驗證等待 60 秒；出現互動驗證時給 180 秒，compact widget 位於查詢按鈕下方。程式區分「安全驗證中」與「蒟蒻翻資料中」，較久時補等待提示。

既有 Turnstile widget 已由 invisible 改為 managed，保留原網域、sitekey、Secret 與 no_clearance。後端 Siteverify、hostname／action 檢查與限額流程未變。官方說明：[顯示與回呼設定](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)、[驗證模式](https://developers.cloudflare.com/turnstile/concepts/widget/)。

部署版本 `1d78191b-98cf-40c5-9366-4afb7324330f`。55 tests/build 通過；公開手機尺寸下兩種模式皆通過真實驗證與產文，取消後再查正常，未出現互動勾選（該流程由 callback 測試涵蓋）。未在使用者實際手機或實際慢速連線驗收。公開 API、混合搜尋與無 token 403 檢查在 artifacts/turnstile-public-check.json。

## Managed 檢索融合更新

2026-11-06 最終 Worker 版本 `22cc2e86-fe17-480f-98e4-427b51dcb9e1`。僅更新 Worker 搜尋／生成規則，靜態資產未變，不重建索引、不更換模型、不改 Secrets 或 Turnstile。AI Search 仍使用 hybrid、10 結果、0.35 threshold、context expansion 1；本次未啟用 reranker 或 query rewrite。

managed 結果使用完整原文對照，與 raw BM25 做來源層級 RRF；只在 keyword-only fallback 保留既有主題篩選。最多 6 個來源、8 段候選，3,200 字生成 context 維持不變。8 題重播找回通學安全與都市微森林原先被排掉的來源，並完成實際 Luna 產文與引用核對；產文補驗時每案重建本地 DB，避免測試自身的每分鐘限額干擾，不改公開站限額。

公開 health/config 為 200，兩個漏查例子由 AI Search 找回預期官方來源，無驗證 token 的生成請求仍 403（artifacts/managed-rag-public-check.json）。本次不聲稱所有問法都已驗證或每句 AI 解讀都必然正確。每來源對照仍有 LIMIT 100，目前語料最大來源 68 段，更新資料時須再檢查。

## 驗證等待恢復更新

2026-11-06 Worker 版本 `9839f44a-4558-418f-91d7-c222cabe0fbb`，前端資產 `/assets/index-Bee3RybV.js`。網站設定請求有 15 秒 deadline，SDK 載入原有 30 秒界限，驗證預設 60 秒、首次互動可延長，而整個前置流程受 180 秒總 deadline 限制。畫面分別提示讀取設定、載入安全驗證、執行安全驗證與整理資料。

既有 Managed widget 使用 appearance=always，不再等互動才顯示；沒有變更 widget key／Secret、網域或後端驗證。新版本連結 `/?v=20261106-verify` 已確認回傳新資產；公開 API 正常，無 token 生成仍 403。測試瀏覽器真實通過兩次驗證與生成，但瞬間可見 iframe 的探測未捕捉到方框，不能當成 iPhone Safari 實機顯示已驗收。使用者仍須重新載入新版後確認該裝置；若仍失敗，可依明確階段與驗證代碼再定位。
