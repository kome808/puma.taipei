# 視覺主題分類頁

在既有Cloudflare Worker新增 `/topics/`，以15張分類卡及手繪SVG圖示呈現86題。使用既有品牌角色、暖橘紙色與原主標；沒有新增政策圖解。分類、關鍵字與現成分享稿直接讀取公開JSON，不呼叫生成API。

點選主題後顯示官方做法、訪談補充、來源差異及含原文連結的分享稿。分享稿可編輯；超過500個UTF-16字元或來源被刪改時不能複製，可還原原稿。來源排序官方在前、訪談在後，資料擷取日期為2026-11-07。

原始／內部證據仍保留於 `content/policy-topics/expanded-topics.json`。`scripts/export-public-topics.mjs` 在prebuild時匯出 `public/topics/data.json`，公開資料不包含內部editor_notes、unit路徑及校讀摘錄。頁面使用外部同源JS，配合現有CSP，不修改Worker驗證或API查詢流程。主題頁連回 `/?mode=reply`，首頁增設主題入口。

本頁提供分類與關鍵字搜尋；社群回應幫手尚未改用這份主題庫作語意檢索。此次發布不構成D1、R2或AI Search的新語料匯入，也沒有新增自動排程。

## 發布與驗證

已發布：https://puma-policy-v1.kome808.workers.dev/topics/ 。Worker版本為 `90ec93aa-9cce-4b52-9861-907aa850ac5e`。65項既有測試及build通過；公開版驗證15分類、86題、肌力搜尋及219字元分享稿複製，字數／來源守門、深連結、瀏覽器返回、Escape、空結果恢復與顯示更多通過。桌面1440px、手機320／390px已檢查；未在實體iPhone Safari驗收。

公開API health與生成設定均就緒；本輪沒有呼叫模型產文。證據：`artifacts/topics-page-uat.json`、`content/policy-topics/publication.json`及`output/playwright/topics-public-desktop.png`。
