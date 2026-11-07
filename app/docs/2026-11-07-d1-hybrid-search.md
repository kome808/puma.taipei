# D1全文搜尋與AI Search混合搜尋（尚未部署）

使用者決定保留固定主題與摘要，新增D1全文搜尋及AI Search混合搜尋；語意查詢超過免費額度時停止服務。這版不產生新回答，也不使用OpenAI API。

## 產品與API

- 預設顯示15類、86題。輸入、切換模式、分類、返回與開啟主題都不自動執行搜尋；只有按下唯一的搜尋按鈕才送出。
- 基本搜尋 `POST /api/topic-search`：D1 FTS5先找候選，再以既有詞彙與同義詞規則排序。中文先分詞並加雙字片段，避免直接套英文斷詞。沒有語意搜尋的月額度限制，但仍受D1／Workers帳號用量與可用性限制。
- 語意搜尋 `POST /api/semantic-search`：Cloudflare AI Search `search()`，`retrieval_type:hybrid`，關閉query rewrite、similarity cache；不呼叫 `chatCompletions()` 或任何生成API。
- 兩種請求都只帶query及corpusVersion；回傳題號及資料版本。語意成功時另回quota。前台按題號顯示現有JSON，不使用上游片段拼寫新摘要。
- 找不到資料回空題號陣列；版本、索引或服務故障回明確錯誤，不補答案。舊 `/api/generate`、`/api/search`仍回410。
- 設定未啟用時語意按鈕停用。達1,000次時顯示「語意搜尋本月額度已用完，目前無法提供服務。你仍可使用基本搜尋。」；沒有自動付費升級或切換其他模型。

## 額度與併發

`semantic_search_usage`存每個週期的count與更新時間，沒有原始問題。上限是程式常數1,000，沒有可提高上限的環境變數。

通過輸入、來源、版本、索引與用戶端限流檢查後，以單一 `INSERT ... ON CONFLICT ... WHERE count<1000 RETURNING count`原子寫入預留次數，再呼叫一次上游。沒有先讀再加的競態；沒有成功預留就不呼叫。錯誤、逾時、用戶端取消及不完整回應都不退回額度，也不自動重試。上游等待上限12秒，前台20秒。

每個用戶端另限5次／分鐘、30次／日。使用Cloudflare提供的IP與獨立salt產生SHA-256雜湊，不把原始IP或問題存進D1；只保存限流桶並清除過期紀錄。不重新加入曾造成Safari卡住的Turnstile查詢驗證。

`SEMANTIC_QUOTA_RESET_DAY`可設1至31，UTC計時；短月將日期限縮至當月最後一天，下一個月仍依原設定日計算。預設1。**此為本站計數週期，Cloudflare文件未明確保證其AI Search額度在相同邊界重設。** 正式啟用前必須從帳號用量／帳單確認週期並對齊，不可任意改日期來重開額度。

Cloudflare額度按帳號共用；先確認同週期既有語意／混合查詢次數，再把本站D1當期count至少提高至該已用量，不能歸零。若同帳號其他系統持續直接使用AI Search，單靠本站計數不能保證整個帳號不超額；需共用預算閘門或另保留足夠額度。AI Search直接公開端點必須停用，前台不能拿到可繞過此閘門的憑證。

## 索引與版本

`scripts/export-public-topics.mjs`只取可公開欄位，產生：

1. `public/topics/data.json`：既有內容加 `semantic_corpus_version`，摘要正文與引用不改。
2. `shared/topic-search-manifest.json`：完整版本hash、題號allowlist、文件prefix。
3. `generated/topic-search-data.sql`：版本化D1 FTS索引，可重複匯入，不刪舊版、原文、回報或quota；最後才更新active版本。runtime另外檢查版本及完整86題數量。
4. `generated/semantic-topics/puma-note-topics/<hash前32碼>/tNNN.md`：86份題號文件。folder長度低於Cloudflare metadata前64個UTF-8 bytes限制；完整版本仍在manifest與文件中。

語意請求以當前folder篩選，結果還要符合當前prefix與題號allowlist。舊版、其他文件、未知題號及上游文字都不會直接顯示。來源文件變更後須先人工修訂主題、重新建置及同步索引；自動索引不會自行改寫公開摘要。

## 本機與建置

```sh
cd app
npm run dev -- --ip 127.0.0.1 --port 8890 --inspector-port 8891
```

`predev`先建置；預覽程式只匯入本機D1 runtime schema及主題索引，再以明確的D1、production及語意停用CLI binding啟動Pages。資料持久化於 `.wrangler/topic-preview/`，不連遠端AI Search。曾觀察Pages dev未自動載入設定檔的D1／vars，所以不只依賴隱式設定；發布時也要確認實際綁定。

```sh
npm run build
npm run build:static
npm test
node scripts/sync-topic-search.mjs --dry-run
```

最後一個指令檢查86份文件與版本、列出預計目的地，沒有網路請求。本輪沒有執行上傳或遠端SQL。

## 發布準備與順序（本輪不執行）

兩份Pages設定都指向同一個 `puma-note`，不是獨立環境。`pages-static/`只接D1，可作本機／只開基本搜尋版本；完整發行使用 `pages-search/`。不要交替發行而意外移除AI Search binding。

1. 先完成來源人工核對、桌面／實體Safari／慢速網路驗證，記錄回滾版本。來源擷取、內容更新、人工核對與部署日期分開，不把新索引日期當作已核對日期。
2. 確認Cloudflare登入與帳號。先在現有D1套用 `worker/runtime-schema.sql`，再匯入 `generated/topic-search-data.sql`。只更新新runtime／主題表，不能執行舊corpus reset或清空usage／reports。
3. 將 `sync-topic-search.mjs --dry-run`列出的目的地核對後，於獲准發行時才執行 `node scripts/sync-topic-search.mjs --apply`。此腳本保留精確的versioned key，不使用會加上 `search-docs/`的舊原文匯入器，也不刪舊R2檔案。
4. 建立／確認專用AI Search instance `puma-note-topics`，資料來自上述R2文件，索引包含當前versioned folder；使用Cloudflare Workers AI embedding，不接OpenAI或外部模型。確認hybrid索引已完成、檢索回傳當前folder及題號；不能只看到上傳成功就啟用。
5. 核對帳號週期及既有用量，把同帳號已用次數納入當期D1 counter；補上Pages的 `RATE_LIMIT_SALT` Secret（至少24字元，隨機生成，不放前端或版控）。停用AI Search直接公開端點。未確認任一項時保持 `SEMANTIC_SEARCH_ENABLED:false`。
6. 在核定的 `pages-search/wrangler.jsonc`確認D1與 `SEMANTIC_SEARCH` instance binding，完成以上檢查後才將啟用旗標設true；不要提高程式的1,000常數。發行前用 `wrangler whoami`確認登入。
7. 更新原 `puma-policy-v1` Worker，確保原Workers網址的生成與舊檢索API均回410，再更新Pages靜態包與API shim。新D1資料與部署程式的manifest必須一致。不要再建置舊Pages gateway。
8. 發行後檢查實際D1／AI Search binding及旗標、首頁／單題網址、D1與語意各一次、quota增量、來源及複製功能；對帳實際AI Search用量。完整成功後才更新 `publication.json`，保留前一個Pages與Worker版本作回滾。

語意成功與額度耗盡的前台檢查可用測試替身，不應為了驗收而真的消耗1,000次Cloudflare檢索。回滾程式時也不能回復成仍可呼叫OpenAI生成的舊入口。

## 驗證界線

單元測試使用本機SQLite與AI Search替身；本機Pages預覽使用真正的本機D1。這能驗證查詢、版本、配額、錯誤提示、內容映射及UI，不能證明遠端索引完成、真實語意召回率、正式Cloudflare帳號費用或實體iPhone Safari行為。正式服務仍是舊部署，這批變更尚未發布。

官方參考：[AI Search檢索流程](https://developers.cloudflare.com/ai-search/concepts/how-ai-search-works/)、[binding](https://developers.cloudflare.com/ai-search/api/search/workers-binding/)、[篩選](https://developers.cloudflare.com/ai-search/configuration/retrieval/filtering/)、[額度與費用](https://developers.cloudflare.com/ai-search/platform/limits-pricing/)、[D1全文搜尋](https://developers.cloudflare.com/d1/sql-api/sql-statements/)、[D1費用](https://developers.cloudflare.com/d1/platform/pricing/)。

## 本輪完成的驗證

兩種建置成功、124項測試通過、0失敗；上傳工具dry-run確認86份文件且未連網。額度測試同時提出1,020次預留，恰好1,000次通過，後20次在上游呼叫前被擋。重匯主題索引不會歸零quota／回報，也不刪舊版索引。

本機Pages＋D1實測五個代表問題各找到預期主題。語意成功／429額度用盡以替身驗證，沒有呼叫真實AI Search；失敗時仍可瀏覽86題並切回D1搜尋，不會把服務故障顯示成「0題符合」。390px手機版無橫向溢出。摘要與來源保持原樣。

[機讀驗證結果](../content/policy-topics/revisions/2026-11-07-d1-hybrid-search/verification.json)、[桌面](screenshots/2026-11-07/d1-hybrid-desktop.png)、[手機](screenshots/2026-11-07/d1-hybrid-mobile.png)、[語意額度提示（模擬回應）](screenshots/2026-11-07/d1-hybrid-quota-mobile.png)。
