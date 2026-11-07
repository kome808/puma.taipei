# 視覺主題分類頁

在既有Cloudflare Worker新增 `/topics/`，以15張分類卡及手繪SVG圖示呈現86題。使用既有品牌角色、暖橘紙色與原主標；沒有新增政策圖解。分類、關鍵字與現成分享稿直接讀取公開JSON，不呼叫生成API。

點選主題後顯示官方做法、訪談補充、來源差異及含原文連結的分享稿。分享稿可編輯；超過500個UTF-16字元或來源被刪改時不能複製，可還原原稿。來源排序官方在前、訪談在後，資料擷取日期為2026-11-07。

原始／內部證據仍保留於 `content/policy-topics/expanded-topics.json`。`scripts/export-public-topics.mjs` 在prebuild時匯出 `public/topics/data.json`，公開資料不包含內部editor_notes、unit路徑及校讀摘錄。頁面使用外部同源JS，配合現有CSP，不修改Worker驗證或API查詢流程。主題頁連回 `/?mode=reply`，首頁增設主題入口。

本頁提供分類與關鍵字搜尋；社群回應幫手尚未改用這份主題庫作語意檢索。此次發布不構成D1、R2或AI Search的新語料匯入，也沒有新增自動排程。

## 發布與驗證

已發布：https://puma-policy-v1.kome808.workers.dev/topics/ 。Worker版本為 `90ec93aa-9cce-4b52-9861-907aa850ac5e`。65項既有測試及build通過；公開版驗證15分類、86題、肌力搜尋及219字元分享稿複製，字數／來源守門、深連結、瀏覽器返回、Escape、空結果恢復與顯示更多通過。桌面1440px、手機320／390px已檢查；未在實體iPhone Safari驗收。

公開API health與生成設定均就緒；本輪沒有呼叫模型產文。證據：`artifacts/topics-page-uat.json`、`content/policy-topics/publication.json`及`output/playwright/topics-public-desktop.png`。

## 2026-11-07 本機修訂：改名、全部主題直接展開、短摘要補寫（尚未部署）

- 網站名稱改為「Puma政策筆記」：首頁與主題館的頁首、頁尾、`<title>`、description、og／twitter 分享資訊、資料檔 `name` 已統一；定位為民間獨立整理的政策與訪談筆記，供理解、核對與研究，非官方網站。舊吉祥物口吻文案（「蒟蒻幫你翻」等）改為中性說明。
- 主題館：15張分類卡只作導覽與切換；下方依類直接展開全部86張主題卡（桌面3欄、平板2欄、手機1欄）。卡片顯示題目、簡介與「官方政策／訪談補充／公共議題觀點」標記，點選開啟詳細說明。搜尋時結果緊接在查詢框下方，分類卡移到結果之後；有「清除篩選」；`?topic=`、`?group=`、`?q=` 網址保留。
- 日期：資料檔含 `source_snapshot_date`（來源擷取）與 `content_updated`（內容更新），頁面分開顯示，並註明網站部署日期另計。
- 短摘要：86題逐題對照原文改寫，完整內容（含標點、換行、實際來源網址）≤500 UTF-16字元；驗證與寫入腳本為 `scripts/apply-summary-500.py`，逐題原文摘錄與檢查表在 `content/policy-topics/revisions/2026-11-07-summary-500/`。t006、t008 補入有原文摘錄的訪談段落與來源。
- 驗證：`npm test` 79項通過（含新增 `tests/topics-data.test.ts` 8項）、`npm run build` 通過；Chromium 檢視桌面1440px與手機390px，86張卡片、15個區塊、15張分類卡皆可見，無水平溢出與主控台錯誤。
- 未驗證：容器無法連到外部網站，來源網址未逐一實際開啟（改以「網址皆出現在已下載的來源快照」核對）；未在實體手機與 Safari 驗收；訪談逐字稿未逐句對照影音。

### 發布時要更新哪個服務

實際頁面與靜態資料由 Worker `puma-policy-v1` 提供；Pages `puma-note` 只經 `POLICY_BACKEND` Service Binding 轉送。要讓新版主題館、改名與短摘要上線，必須重新部署 Worker `puma-policy-v1`（含 `dist/` 靜態資產與 `public/topics/`）；只部署 Pages 入口不會更新頁面內容。本輪未部署，未更動帳號共用 Workers 子網域、Secret 或模型設定；既有查詢仍呼叫 OpenAI，這項實際流程沒有改變。

### 跨訪談綜合（2026-11-07 後續）

同一主題常在不同訪談重複出現，因此 `revisions/2026-11-07-summary-500/revise-*.json` 對12題（t020、t032、t040、t041、t042、t046、t050、t062、t068、t069、t073、t083）合併比較其他訪談或官方頁的說法：摘要可引用1–3個來源，每個來源都須有原文摘錄；短摘要以官網說法為主，不在摘要裡寫「兩處說法不一樣」，訪談只補充不衝突的細節；詳細頁也不再顯示「來源說法有差異的地方」（2026-11-07決定：官網說法為主，訪談的小差異一律回到官網內容；原有5題差異說明已移除，`differences` 欄位一律為空）。其餘題目在目前對應的來源範圍內已寫入主要說明，字元數偏短者仍列於檢查表。

### 分享預覽圖與錯誤回報（2026-11-07）

- 分享預覽圖：`public/og-image.png`（1200×630，約94 KB），來源版面為 `scripts/og-image.html`（以 Chromium 截圖重產）。首頁與主題館都已加入 `og:image`／`twitter:image`（`summary_large_image`）、尺寸與替代文字。圖片網址為絕對網址 `https://puma-note.pages.dev/og-image.png`，要等 Worker 部署後社群平台才抓得到；各題共用同一張圖，單題不另生成。
- 錯誤回報：每題詳細頁有「發現錯誤？回報這一題」。選問題類型、選填說明後，可「複製回報內容」（含題號、頁面網址、問題類型、資料版本、短摘要字元數與本題來源）。表單不儲存、不傳送任何資料，也沒有後端。
- 郵件回報：在 `public/topics/site-config.js` 填入 `REPORT_EMAIL`（公開信箱，請用專收回報的信箱）後，會多出「用郵件寄出」按鈕；留空則只顯示複製。
