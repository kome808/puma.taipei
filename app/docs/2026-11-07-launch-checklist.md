# 上線檢查清單：Puma政策筆記（靜態主題館）

> **2026-11-09：使用者已同意更新網站，請改照 [2026-11-09 網站更新步驟](2026-11-09-deploy.md)（基本搜尋版）。本檔保留作歷史。**


> **後續需求已改變，請勿直接照下方舊清單部署。** 使用者現已指定D1全文搜尋＋AI Search混合搜尋，語意搜尋全站每週期上限1,000次。最新架構與發布前置條件見 [D1與混合搜尋說明](2026-11-07-d1-hybrid-search.md)；需要準備D1主題索引、精確版本的語意索引及額度對帳。下方基於663840d的純瀏覽器搜尋清單保留作歷史；匿名回報仍不啟用。此標記不構成部署授權，本輪仍未部署。


狀態：**尚未部署**。供使用者本人，或在使用者電腦上已登入 wrangler 的 Codex 照做。雲端容器沒有 Cloudflare 憑證，無法代為執行。

> 本檔已依分支最新架構重寫（2026-11-07，整合 `663840d`）。先前草稿假設「Worker＋D1 匿名回報」，與現行架構不符，已作廢。架構以 [靜態搜尋紀錄](2026-11-07-static-topic-search.md) 為準。

## 現行架構與這次要發布的內容

- 公開端改為**純靜態 Pages**（`pages-static/` → `app/static-dist`），不再透過 `POLICY_BACKEND` gateway。搜尋在瀏覽器內比對 86 題，**不呼叫 OpenAI、不使用 Cloudflare AI Search**。
- 原 Worker `puma-policy-v1` 的 `/api/search`、`/api/generate` 改回 410 `FEATURE_RETIRED`；`wrangler.jsonc` 已移除 AI Search binding 與模型／Turnstile 變數。D1、R2、既有 Secret 與 AI Search 遠端資源**沒有刪除**。
- 這批內容一次上線：改名「Puma政策筆記」、86 題短摘要（含網址 ≤500 字元）、15 類＋86 張卡片、分享預覽圖、逐題回報入口（複製回報內容）。
- **匿名回報收件（D1 `reports`、管理路由、agent 工具）這次不啟用。** 靜態 Pages 沒有 D1 與 Turnstile，`reportsOpen` 為 `false`，回報表單只提供「複製回報內容」。程式與測試保留，想啟用須另做設計（見最後一節）。

先前文件中「建立 `reports` 表」「設定兩個 Secret」「Pages 入口只轉送」都**不屬於這次上線**，不要執行。

線上現況（回退時對照）：Pages `puma-note` 版本 `848d4f40-6f6c-4f48-8f25-e92ea08ed913`（gateway）；Worker `puma-policy-v1` 版本 `90ec93aa-9cce-4b52-9861-907aa850ac5e`。

## 步驟

### 0. 取得分支與登入

```sh
git fetch origin claude/kind-cerf-xyiajt && git checkout claude/kind-cerf-xyiajt && git pull
cd app && npm ci
npx wrangler whoami      # 應為 kome808@gmail.com、帳戶 4c10afbddf5fd32960496609cc2061d0
```

### 1. 部署前驗證（失敗就停）

```sh
npm test                 # 預期 101 項全過（本機最後一次結果）
npm run build            # tsc ＋ 主題 JSON 匯出 ＋ 原 Worker 的 dist
npm run build:static     # 產生 app/static-dist（Pages 用）
```

再人工看一次 `app/docs/2026-11-07-static-topic-search.md` 的整合驗證與截圖，並抽查 `static-dist/topics/data.json` 的 `site.name` 為「Puma政策筆記」。

### 2. 先更新原 Worker（讓舊 API 退役）

```sh
npx wrangler deploy
```

部署會移除 Worker 上的 AI Search binding 與模型變數；Secret 與 D1／R2 不受影響。完成後記下新版本 ID，並檢查：

```sh
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://puma-policy-v1.kome808.workers.dev/api/generate   # 410
curl -s -o /dev/null -w "%{http_code}\n" https://puma-policy-v1.kome808.workers.dev/api/search?q=test      # 410
curl -s https://puma-policy-v1.kome808.workers.dev/api/health   # mode: static-topic-search
```

### 3. 發布靜態 Pages 到既有專案 `puma-note`

這會取代原本的 gateway（不再綁定 `POLICY_BACKEND`）。**從 `pages-static/` 目錄執行**，不要用 `app/pages-gateway`，也不要跑舊的 `build-pages-gateway.mjs`：

```sh
cd ../pages-static
../app/node_modules/.bin/wrangler whoami
../app/node_modules/.bin/wrangler pages deploy ../app/static-dist --project-name puma-note --branch main --no-bundle
```

### 4. 部署後檢查

```sh
for u in / /topics/ "/topics/?topic=t001" /og-image.png /topics/data.json; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "https://puma-note.pages.dev$u"
done
curl -s https://puma-note.pages.dev/api/config     # mode: static-topic-search, reportsOpen: false
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://puma-note.pages.dev/api/generate   # 410
curl -s -o /dev/null -w "%{http_code}\n" https://puma-note.pages.dev/api/admin/reports       # 不可為 200
```

在瀏覽器（桌機與手機各一次）人工確認，**這些我與 Codex 都不能替你驗證**：

1. 首頁直接是主題館，15 類與 86 張卡片一次可見；搜尋結果緊接查詢框；清除、單題網址正常。
2. 詳細頁沒有「來源說法有差異」；複製摘要與畫面一致，網址可開。
3. 頁面全程沒有向 OpenAI 或 Turnstile 發出請求（開發者工具 Network 看）。
4. 回報表單只有「複製回報內容」，沒有匿名送出按鈕。
5. 在 LINE／Facebook 分享偵錯工具貼連結，預覽圖與標題為「Puma政策筆記」。
6. 實體 iPhone Safari 開一次（目前只做過 390px 模擬）。

### 5. 上線後記錄

- 更新 `content/policy-topics/publication.json` 與 `release-status.json` 為已上線版本、日期與 Pages／Worker 版本 ID。**部署成功並驗證後才改**；來源快照日期與部署日期要分開寫。
- 把本檔步驟 2、3 的版本 ID 與檢查結果記進 `app/docs/cloudflare-setup.md`。

## 回退

- Worker：`npx wrangler rollback 90ec93aa-9cce-4b52-9861-907aa850ac5e`（舊版含 AI Search 與 OpenAI 流程，回退等於恢復生成功能，請先確認這是你要的）。
- Pages：在 Cloudflare 後台 Pages → `puma-note` → Deployments，選前一個部署（`848d4f40…`，gateway）「Rollback」，或重新發布舊 `pages-dist`。若 Pages 回到 gateway，Worker 必須同時在可用版本。
- 兩者順序：要全面回退時，先回 Worker，再回 Pages。

## 不要做的事

- 不要貼出或保存任何 token／金鑰；不要讀取、搬移或刪除既有 Secret（`OPENAI_API_KEY`、`TURNSTILE_SECRET_KEY`、`RATE_LIMIT_SALT`）。
- 不要執行 `smoke-live.mjs` 或任何會呼叫 OpenAI 的查詢。
- 不要刪除 D1、R2、AI Search 遠端資源，也不要重設 `request_limits`／`generation_usage`；是否保留由你之後另行決定（AI Search 2026-12-01 起計費，閒置也建議之後決定是否停用）。
- 不要更動 Turnstile widget、共用 Workers 子網域或模型設定。
- 不要把「無 AI」寫得過頭：公開端現在不呼叫模型，但 86 題內容的整理流程曾使用生成模型輔助與人工／Codex 查核，對外說明要與 `release-status.json` 的實際流程一致。

## 部署前仍待你決定

- `public/topics/site-config.js` 的 `REPORT_EMAIL` 為空，所以沒有信件備援；要的話先填入再建置。是否另外開 GitHub Issues 當回報管道。
- 48 題摘要不足 400 字元（來源偏少）是否補來源；t041 來源標題與內容不符；家庭支持頁 6 次與 3 次諮商的採用依據。
- 67 個摘要網址在容器內無法開啟，只對照過下載快照；上線前建議在本機抽查或逐一開啟。
- 是否要啟用匿名回報收件（見下）。

## 若之後要啟用匿名回報收件

目前不可行的部分：靜態 Pages 沒有 D1 binding、沒有 Turnstile，CSP 也未允許驗證腳本。可行方向二選一，**都需要先開發與測試再上線**：

1. 為 `puma-note` 加 Pages Functions，綁 D1（`reports` 表）並設定 Turnstile 與兩個管理權杖，同步調整 CSP。
2. 繼續用「複製回報內容」，由你貼到 Issue／信件／文件，再交給 agent（`scripts/reports-agent.mjs` 在此情境下用不到）。

啟用時要做的 D1／Secret 步驟（舊清單所列）屬於那時才執行：

```sh
npx wrangler d1 execute puma-policy-v1 --remote --file worker/runtime-schema.sql   # IF NOT EXISTS，可重複
npx wrangler secret put REPORTS_READ_TOKEN     # ≥24 字元，本人輸入
npx wrangler secret put REPORTS_WRITE_TOKEN
```

細節見 [回報收件與 agent 處理規範](2026-11-07-reports-for-agents.md)。

## 給 Codex 的提示詞

見 `docs/2026-11-07-launch-prompt-for-codex.txt`（短版，可直接貼上）。
