# t005 住宅政策社群圖卡

2026-11-09，使用者指定以 [t005 主題頁](https://puma-note.pages.dev/topics/t005/) 試作社群文字圖卡，後續要求移除「政策主張整理，非已實施成果。」並用作連結分享預覽。

## 目前使用版

- `t005-住宅政策-社群圖卡-v4.png`：1080 × 1350 直式下載版。
- `../../../public/social/t005-housing-20261109-v4.png`：1200 × 630 橫式 Open Graph／Twitter 預覽圖；只套用 t005。
- `../../../public/social/t005-housing-portrait-20261109-v4.png`：1080 × 1350 直式公開下載檔，與本目錄 v4 PNG 相同。
- `../../../public/social/t005-housing-portrait-20261109-v4.webp`：網頁圖卡區使用的壓縮預覽，原始尺寸不變。
- `source-portrait-v4.png`、`source-preview-v4.png`：ImageGen 原始輸出，未覆寫。
- 舊版均保留；v2 為原正式版，v3 為尚未發布的 AI 說明中間版，v4 在網址前補上品牌名稱。

## 圖卡文案與來源

主標：不同家庭，需要不同的住宅選擇。

三個重點為「活化空屋，增加屋源」「多元取得社宅資源」「依家庭需求規劃」，依 t005 的 2026-11-09 版摘要整理，不改動網站原摘要或政策數據。

- [沈伯洋官網：住宅政策](https://puma.taipei/policies/%E4%BD%8F%E5%AE%85%E6%94%BF%E7%AD%96)
- [房業涵專訪，2026-10-20](https://puma-hub.pages.dev/articles/fang-yehan-2026-10-20/)
- 直式與橫式皆移除「完整摘要與來源」及「民間獨立整理・非官方網站」。
- 圖卡說明：「本圖卡由Puma政策筆記網站以 AI 輔助整理政策重點，完整政策與最新資訊，請以沈伯洋官網為準。」
- 最後一行：「Puma政策筆記網址：https://puma-note.pages.dev/topics/t005/」，明確區分本站與沈伯洋官網。

## 生成方式及提示詞

使用內建 ImageGen 逐版編修；匯出時以 sips 調整成指定尺寸，沒有以程式重畫圖像或替換文字。v4 精確提示詞與輸出紀錄見 `generation-manifest-v4.json`，前一輪見 `generation-manifest-v3.json`。以下為舊版 v2 的製作紀錄。

直式 v2 的提示詞：

```text
Edit this finished Traditional Chinese social text card. Keep its 4:5 portrait composition, 1080x1350 final ratio, the exact headline, all three numbered headings and explanatory paragraphs, brand, category pill, source line, URL, footer statement and little teal waterdrop/house illustration unchanged in wording, illustration style, paper texture, typography and palette. Remove ONLY the complete orange sentence 「政策主張整理，非已實施成果。」 near the bottom. Do not replace that sentence with any new wording. Close the resulting gap tastefully by moving the source / link block upward a little and rebalancing the bottom space; keep all text comfortably readable and safe margins. Retain the lower teal horizontal rule, source line 「來源：沈伯洋官網〈住宅政策〉、房業涵專訪（2026.10.20）」, 「完整摘要與來源」, exact URL 「puma-note.pages.dev/topics/t005/」, and 「民間獨立整理・非官方網站」. No other copy changes and no new words. Output a polished complete portrait card.
```

橫式分享預覽的提示詞：

```text
Use this image as the STYLE AND CONTENT REFERENCE for a new WIDE social link preview image for this exact policy topic. Reflow the design into a polished 1200x630 landscape Open Graph card, ratio 1.90476:1. This is a designed text graphic, not a crop of the portrait card, not a phone mockup. Keep the ivory paper texture, terracotta, ocean teal and dark brown palette, refined Traditional Chinese serif/sans hierarchy and friendly little teal waterdrop with small cream houses. Make the main headline very large and legible at small preview sizes. Layout: small publication brand and category across top; bold primary headline below; small subtitle; then three equal columns of numbered concise policy points. Very restrained thin teal dividers, no bulky UI cards. Bottom contains a compact source/URL row and the small nonofficial attribution. Keep all content inside 60px safe margins. A small waterdrop and house illustration may sit at the bottom-right but must not cover any words. No party emblem, no candidate portrait, no flags, no new claims or numbers. DO NOT include 「政策主張整理，非已實施成果。」 or any replacement disclaimer about outcomes.
Render this exact Traditional Chinese copy, without the wrapping quotation marks:
Brand: 「Puma政策筆記」
Category: 「居住與城市更新」
MAIN HEADLINE: 「不同家庭，需要不同的住宅選擇」
Subtitle: 「沈伯洋住宅政策｜3 個重點」
Column 01 heading: 「活化空屋，增加屋源」
Column 01 text: 「修繕補助、稅務減免，鼓勵空屋投入包租代管。」
Column 02 heading: 「多元取得社宅資源」
Column 02 text: 「運用都更捐贈、公有分回保留，增加社宅屋源。」
Column 03 heading: 「依家庭需求規劃」
Column 03 text: 「婚育宅、青年宅優先；科技宅另採企業合作。」
Source footer: 「資料：沈伯洋官網〈住宅政策〉、房業涵專訪」
URL: 「puma-note.pages.dev/topics/t005/」
Small attribution: 「民間獨立整理・非官方網站」
Use crisp accurately rendered Traditional Chinese text. No invented words. The headline is first hierarchy and the three headings second hierarchy. Body paragraphs must remain sufficiently large to read in a social preview. Output only the finished landscape graphic.
```

## 驗證範圍

已目視核對圖片、指定刪除句、繁體中文文案與來源；確認兩種尺寸。頁面建置測試檢查 t005 的 Open Graph 與 Twitter 使用同一張專屬圖，其餘題目仍沿用原圖。社群平台的實際貼文與快取刷新未操作。

## 網頁下載區

依使用者後續要求，在 t005 摘要與操作按鈕之後加入「下載圖卡，分享政策」區塊，位於摘要複製範圍之外。提供直式／橫式 PNG 下載；點擊預覽可在新分頁開啟直式原圖。桌機兩個下載按鈕並排，手機改為上下排列；預覽圖延遲載入。

實際瀏覽器下載驗證：兩個 PNG 檔名正確、下載成功，且與原檔逐 byte 相符；尺寸為 1080×1350 與 1200×630。390px 手機版沒有橫向溢出；t001 等無圖卡的主題不新增下載區。此次建置及 20 項相關測試通過。驗證與截圖保存於忽略版控的 `app/output/playwright/card-download/`。

下載區首次部署為 `c16f8265-90d1-4b21-9565-99b9ceaed90d`，前一版本為 `8751e93d-3e7f-4fe0-8429-4bbcc274f314`。當時只更新 t005 HTML、共用 CSS，並新增直式 PNG 與壓縮預覽 WebP；正式 112 個公開檔案核對通過。舊發布套件與核對記錄在忽略版控的 `app/output/policy-sharing-deploy-20261109/card-download/`。

## 目前正式版：品牌網址與 AI 說明

2026-11-09 Production/main：`a84e0945-3384-4b3b-897d-15670b080767`。已發布至 [t005 圖卡下載區](https://puma-note.pages.dev/topics/t005/#share-card-title)，直式下載、橫式下載與分享標籤皆指向 v4。

同次統一首頁、主題館與 86 題頁尾；保留各題的實際內容更新日期。網站說明為「本站以 AI 輔助整理政策重點，完整政策與最新資訊，請以沈伯洋官網為準。」，並保留 PUMA HUB 致謝、來源連結及網站問題回報。

以前一正式版 `f1d7c433-d408-4d86-9419-ecc69e1831e8` 為基底，保留該批最新首頁三步驟分享預覽圖。只更動 88 份 HTML 的頁尾、t005 圖卡路徑及新增 3 個圖卡檔；摘要與來源、複製功能、政策資料、搜尋索引、CSS／JS、Worker 皆逐 byte 保留。

194 項測試通過；1440px／390px 的首頁、t001、t005 頁尾與回報表單通過瀏覽器檢查。兩種 PNG 實際下載成功，檔名、尺寸與 bytes 核對正確。正式 116 個公開檔案全部 HTTP 200 且 SHA-256 符合套件，設定與登入邊界維持。正式瀏覽器已確認新版圖卡及頁尾；未實際發布社群貼文或驗證既有貼文快取。發布套件與逐檔核對結果：`app/output/policy-sharing-deploy-20261109/footer-ai/`；瀏覽器紀錄：`app/output/playwright/footer-ai/`。

## 2026-11-09 v5（直式）：修正生成圖的錯字

Claude 整合時檢查發現 v4 直式圖（`t005-housing-portrait-20261109-v4.png`）說明列寫成「請以沈伯洋官𥲤為準」，第二字是生成模型畫錯的字，橫式 v4 正確為「官網」。v5 直式以同一張圖第一列「網站」的「網」字（同字型、同字級）覆蓋錯字：先以邊界內插重建紙紋背景，再疊上原字筆畫與外光暈，沒有重新生成或改動其他文字。新檔為 `public/social/t005-housing-portrait-20261109-v5.png` 與 `.webp`；頁面改指向 v5，v4 直式自公開資料夾移除。橫式 v4 未變。
