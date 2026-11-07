# 靜態主題搜尋：本機待發布

2026-11-07使用者確認公開端不接OpenAI API，採Cloudflare免費功能搜尋既有主題。這版只比對86題與回傳固定內容，不產生新摘要。已先拉取Claude的`bc921b1`修改，保留其來源查核與刪句成果；本輪沒有改動`expanded-topics.json`、摘要正文或原文。

## 運作方式

`public/topics/topic-search.mjs`在瀏覽器做NFKC、臺／台與大小寫正規化，搭配中文分詞、字串片段及少量主題同義詞，對題目、關鍵字、介紹與內容加權排序。回傳的是原始topic物件；不將來源重新拼成回答，也不推斷使用者政治立場。

無查詢時依15類顯示全部86張卡片；有查詢時依相關性排列，結果緊接輸入框。找不到時顯示空結果。詳細內容、短摘要與來源沿用固定資料；手動編輯及複製仍受500字元與完整來源檢查。

這是詞彙搜尋，不能宣稱理解所有自然語言或同義說法。首次需載入公開JSON，後續比對不產生新的網路請求；網址仍可帶查詢與主題作深連結。

## 公開程式與封存工具分開

- `worker/index.ts`不再import原OpenAI、AI Search、DB檢索或Turnstile流程。
- 舊`/api/generate`、`/api/search`的所有方法回410 `FEATURE_RETIRED`；設定及健康端點明確回報靜態模式，不依賴任何AI或資料庫。
- 原Worker的`/`與`/index.html`導向`/topics/`；React入口也只保留導向，沒有產文表單。
- `app/wrangler.jsonc`已移除AI Search binding及模型／Turnstile vars。原D1/R2資料與Secret沒有刪除；舊檢索、生成、匯入程式作歷史／內部工具保留，並非公開入口。

## Pages包與預覽

新Pages設定在根目錄`pages-static/wrangler.jsonc`，與原Worker的`app/`分開。`scripts/build-static-pages.mjs`只複製`public/`，另外讓根目錄`index.html`與主題館HTML相同；不複製Vite的React bundle。API shim編譯自已退役的Worker入口，`_routes.json`僅包含`/api/*`。HTML、CSS、JS、JSON及圖片直接走靜態服務。

```sh
cd app
npm run build:static
npm test
npm run dev -- --ip 127.0.0.1 --port 8890 --inspector-port 8891
```

本機曾從`app/pages-static`啟動Wrangler卻帶入父層Worker的DB／R2設定，連`--cwd`也未排除；移到獨立目錄、以`preview-static-pages.mjs`從該目錄啟動後，實測只剩CF_PAGES平台資訊，根目錄直接是主題館、沒有React跳轉。此為已驗證的隔離作法，不推定所有Wrangler版本都有同樣行為。

## 發布步驟（本輪不執行）

1. 先重新建置及測試，確認新資料均已人工核對。
2. 更新原`puma-policy-v1` Worker及其資產，驗證舊Workers網址的生成／搜尋API回410。保留原始資料，不重設D1，也不讀出Secret。
3. 從根目錄`pages-static/`發行`../app/static-dist`至既有`puma-note`。這次取代的是原gateway；確認Pages不再綁定`POLICY_BACKEND`。不執行舊`build-pages-gateway.mjs`。
4. 驗證`puma-note.pages.dev`根目錄、`/topics/`、單題網址、搜尋及複製；API回410，頁面請求沒有生成模型或驗證SDK。來源日期與部署日期分開。

正式命令應先確認登入（`wrangler whoami`），再從正確目錄執行：

```sh
# 位於專案根目錄；完成測試與發布決定後才執行
cd pages-static
../app/node_modules/.bin/wrangler whoami
../app/node_modules/.bin/wrangler pages deploy ../app/static-dist --project-name puma-note --branch main --no-bundle
```

不能只換前台頁面而讓舊Worker生成端點繼續可用，也不能因本機已改就更新`publication.json`為已上線。

## 費用界線

依2026-11-07查閱的Cloudflare文件，靜態資產請求免費且不限量；Workers／Pages Functions另依方案計算，Free含每日100,000次。此版一般頁面和搜尋不需函式，每次在已載入頁面內搜尋也沒有模型token或搜尋API費。帳號原有付費方案、其他專案或額外服務不因此自動取消。

AI Search目前每月包含1,000次語意及1,000次全文查詢，並列出2026-12-01起計費，不能宣稱無限制免費，因此未放進這版公開查詢。遠端既有AI Search/R2資料未刪除，是否保留由後續資源管理另行處理。

官方來源：[Pages靜態資產與Functions計費](https://developers.cloudflare.com/pages/functions/pricing/)、[Workers靜態資產計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)、[Workers方案](https://developers.cloudflare.com/workers/platform/pricing/)、[AI Search額度與價格](https://developers.cloudflare.com/ai-search/platform/limits-pricing/)。

## 整合驗證（2026-11-07，尚未部署）

已整合Claude同日新增的分享預覽圖與逐題錯誤回報入口（`0a0f09f`），保留其原始資料及摘要。`npm run build`、`npm run build:static`成功；`npm test`共94項通過、0失敗。可機讀紀錄見[驗證結果](../content/policy-topics/revisions/2026-11-07-static-search/verification.json)。

本機Pages預覽從`pages-static/`啟動，只載入平台的CF_PAGES資訊，沒有原Worker的DB、R2或模型binding。根目錄直接呈現主題館，預設顯示15類與86張卡片。都更起始房源、銀髮肌力、教師行政負擔、臨時托育、AI教練等五個問題均找到預期主題；查詢、開啟內容及回報表單的操作期間沒有新增網路請求。搜尋只回傳既有內容，不代表涵蓋所有問法。

短摘要實測與資料中的`share.text`逐字相同，來源網址解碼後相符；可複製，超過500字元會停用複製，還原可恢復原文。回報表單可展開，尚未設定收件信箱時沒有寄信連結，操作不傳送資料。原搜尋／生成API均回410，健康與設定端點顯示靜態模式。

1440px桌面及390px手機版瀏覽器預覽已檢查，手機沒有橫向溢出；[桌面截圖](screenshots/2026-11-07/free-static-desktop.png)、[手機截圖](screenshots/2026-11-07/free-static-mobile.png)已更新。未在實體iPhone Safari或正式站驗證。這些結果僅證明本機版本；`publication.json`及遠端服務均未更動。
