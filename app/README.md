# Puma政策筆記

最新本機變更：首頁換上使用者指定主／副標，86題新增 `/topics/tNNN/` 獨立靜態頁與複製連結，保留舊query連結。這批仍未部署，見[變更與預覽](docs/2026-11-07-topic-pages.md)。

最新本機介面調整：內容頁只顯示一份唯讀短摘要，來源連結直接保留其中；移除另外兩段說明、重複來源清單與還原按鈕。這批介面變更尚未部署，見[變更與預覽](docs/2026-11-07-summary-only.md)。

本機最新版使用 **D1全文搜尋＋Cloudflare AI Search混合搜尋**。15類、86題仍以固定資料呈現；兩種搜尋只回傳題號，畫面依題號顯示既有摘要與來源，不即時撰寫答案。

**尚未部署。** 線上仍以 `content/policy-topics/publication.json` 為準，不能把本機停用生成或新增搜尋視為已上線。

## 搜尋與額度

- 基本搜尋：按下搜尋後才查D1全文索引，不消耗語意搜尋的1,000次額度；分類瀏覽不送搜尋請求。
- 語意搜尋：只呼叫AI Search的 `search()`，使用hybrid檢索；關閉query rewriting與similarity cache，不使用生成模型或OpenAI API。
- 全站共用每個設定週期1,000次上游嘗試。D1以單一條件寫入先預留額度，再呼叫一次上游；不重試、不退回失敗或逾時額度。達上限回429，基本搜尋仍獨立運作。
- 每個用戶端另限每分鐘5次、每日30次語意嘗試，防止單一來源快速用光額度；只存加鹽雜湊，限流紀錄到期清除。
- 公開端不提供AI Search直接查詢憑證或公開端點。原 `/api/generate` 與 `/api/search` 持續回410。
- 短摘要含來源仍不超過500字元，正文沿用既有版本。本輪只加搜尋與索引，沒有重寫政策或訪談摘要。

## 本機使用

需要Node.js 22.13以上。沿用lockfile安裝後：

```sh
cd app
npm ci
npm run dev -- --ip 127.0.0.1 --port 8890 --inspector-port 8891
```

預覽會先建置公開資料，再把runtime schema和86題索引匯入專用的**本機D1**，不讀取遠端原文、不使用遠端AI。D1與變數以明確CLI binding傳入Pages預覽，持久資料位於 `app/.wrangler/topic-preview/`。語意搜尋預設未啟用，按鈕會顯示停用狀態；分類與D1搜尋可操作。

```sh
npm run build
npm run build:static
npm test
node scripts/sync-topic-search.mjs --dry-run
```

`pretest`與建置都會產生相同版本的公開JSON、搜尋manifest、D1匯入SQL及AI Search文件。測試不呼叫真實模型或遠端AI Search。

## 重要檔案

- `worker/topic-retrieval.ts`：D1全文、AI Search檢索、用戶端限流及全站月額度。
- `worker/runtime-schema.sql`：runtime表與主題FTS表；不得清空既有usage／reports。
- `scripts/export-public-topics.mjs`：從已整理資料匯出公開內容及版本化索引。
- `shared/topic-search-manifest.json`：目前corpus版本、允許題號與語意文件前綴。
- `generated/topic-search-data.sql`：可重複匯入，保留舊版索引、回報與額度，最後更新active版本；由建置產生，不提交產物。
- `generated/semantic-topics/`：86份帶題號、版本與來源的Markdown，僅供檢索索引。
- `scripts/sync-topic-search.mjs`：預設僅盤點；只有明確 `--apply` 才上傳R2，不刪舊資料。
- `public/topics/`：主題館、兩種搜尋的UI及固定內容；`static-dist/`為Pages發行產物。
- 根目錄 `pages-static/`：本機與只開D1的Pages設定；`pages-search/`：加AI Search binding的替代發行設定。**兩者都是同一個puma-note服務，並非兩個環境**，發行時只用核定的設定。

完整設計、發布順序、月額度對帳及實測界線見 [D1與語意搜尋說明](docs/2026-11-07-d1-hybrid-search.md)。[舊靜態版本紀錄](docs/2026-11-07-static-topic-search.md)保留為歷史，不再代表目前搜尋方式。

Cloudflare免費額度按帳號共用；本站1,000次硬上限不會取消同帳號其他服務的費用，也不涵蓋索引與儲存用量。正式啟用前必須對齊Cloudflare實際週期、納入同帳號已有用量。這輪沒有部署、上傳、建立遠端索引、套用遠端SQL、變更方案或Secret。
