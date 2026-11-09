# 首頁政策分享三步驟插圖

2026-11-09，依使用者要求，以三格小水滴使用方法插圖替換首頁大船插圖，整合原有主標、副標及網站用途說明。原大船素材 `public/topics/ocean-ship.png` 保留。

- 生成方式：內建 ImageGen，透明背景。
- 原始生成圖：`hero-source.png`，1942 × 809。
- 網頁使用圖：`../../../public/topics/policy-sharing-steps-20261109.webp`，1536 × 640，約 104KB，保留透明度。
- 步驟以 HTML 有序清單呈現：找到主題 → 一鍵複製 → 分享到社群平台；圖片不內嵌文字。
- 依使用者後續要求，全站公開頁面字級統一放大 12%，以 `topics.css` 的 `--text-scale:1.12` 控制；窄螢幕的搜尋選項及導覽允許換行。
- 使用者選定精簡文案第一版：主標保留「分享洋流小物，更要分享洋流政策。」，下方合併為「整理沈伯洋的官網政策與節目專訪，讓小水滴輕鬆找到、一鍵複製、分享出去。」
- 已於 2026-11-09 部署至正式網站 https://puma-note.pages.dev/ 。

## 生成提示詞

```text
Use case: illustration-story / infographic-diagram. Asset: final website hero illustration, one wide horizontal strip with THREE distinct equally spaced vignettes for a Traditional Chinese policy-note sharing website. Design a refined warm editorial illustration of cute little ocean waterdrop mascots explaining a simple website journey. Read LEFT TO RIGHT: (1) a sea-teal waterdrop mascot uses a magnifying glass to pick a topic from a small cream-and-terracotta browser window of tidy topic cards; (2) a second cheerful sea-teal waterdrop presses a prominent terracotta COPY button beside two overlapping cream document sheets, a small checkmark communicates successful copying; (3) a third cheerful teal waterdrop holds a smartphone with a simple social post card, a terracotta paper airplane flies outward toward two tiny floating speech bubbles. All three scenes MUST have equal width and the same scale, their baselines aligned. Leave generous clear breathing room between scenes; small handdrawn terracotta right arrows between scenes communicate the sequence. Use simple rounded expressive mascots, delicate dark teal outlines, warm orange cheeks, restrained sandy cream highlights, soft watercolor/paper grain, clean flat shapes. Sophisticated friendly Taiwanese editorial website illustration, quiet, coherent, not childish sticker collage. Palette tightly limited to muted sea teal #568f8b, dark teal #295a57, terracotta #c96e3c, sandy cream #f2dfbd. True transparent background, no colored background panel and no white rectangle. No text, no letters, no words, no numerals, no logos, no platform logos, no political candidate portrait, no flags, no ship. Absolutely no typography, labels will be implemented as accessible HTML separately. Wide 2.4:1 landscape composition. Fill most of the canvas but leave 5 percent safe outer margins, all edges of all three scenes fully visible. This is the illustration artwork only, no website screenshot or mockup.
```

## 驗證

- `npm run build:static` 通過。
- 靜態輸出、86 題獨立頁面及內容一致性等既有測試共 16 項通過。
- 放大字級後檢查 1440px 桌機與 390px、320px 手機版面。
- 複製功能已改為「標題＋空行＋完整摘要與來源」；獨立頁／首頁彈窗的一般及備援路徑共四種，均以獨立 Chrome 讀回剪貼簿確認一致。86 題含標題最長 488/500 字元。
- 本機預覽以獨立暫存 D1 啟動，未改動原預覽資料庫的結構；預覽程序已隔離原資料庫版本不合問題。

## 正式發布

- Pages Production/main：`ce4fcbd2-0bdc-4dad-8e79-266863280e15`，部署網址 https://ce4fcbd2.puma-note.pages.dev 。前一版 `55f8dcf0-a75c-4bf5-b991-2fca8967c6d3` 保留。
- 本輪發布首頁、主題館入口、共用字級樣式及新插圖，共 4 個變動的公開檔案。正式瀏覽器已確認精簡文案、三步驟插圖、`--text-scale:1.12`，沒有橫向溢出。
- 完整既有測試 190 項通過；發布後 108 個公開檔案皆 HTTP 200 且 SHA-256 符合發布套件。網站設定與發布前一致；未登入管理頁仍導向 Access，退役 API 維持 410。
- 本輪沿用前一正式版的 86 題頁面、公開政策資料及搜尋 corpus `23484016772e379f9ae2c0c690990a0577b19061fa1f9483de263281016d8ee4`。未執行遠端 SQL、更新索引或變更 Secret。
- 初次圖像發布沒有帶入當時另批 t004、t005 內容更新；後續該批已由 `97588618-ba7c-4520-9026-8e90ecbe77e1` 發布。本文件下方的最終整合版保留這批最新資料與其搜尋索引。
- 實際發布套件、準備腳本、檔案雜湊與正式核對結果保存在忽略版控的 `app/output/policy-sharing-deploy-20261109/`；本次使用其中的 `package/` 發布，沒有 commit 或 push。

## 整合版（圖卡下載區發布前）

- 2026-11-09 Production/main：`8751e93d-3e7f-4fe0-8429-4bbcc274f314`，部署網址 https://8751e93d.puma-note.pages.dev 。
- 使用者回報舊畫面的原因：初次圖像部署 `ce4fcbd2` 後，另一筆 `97588618` 政策內容部署沿用舊版首頁與 CSS，覆蓋了視覺更新；不是以快取假設處理。先以最新政策版合併出 `ab838057`，再發布本整合版。
- 現行首頁保留三步驟插圖、精簡文案、全站字級 12% 增幅。首頁與主題頁的頁尾另調整為主文／來源連結 15.68px、日期與小字 14.56px，手機不再縮回舊字級。
- 86 題與首頁舊式彈窗的複製內容皆加入標題；按鈕與字元數同步說明包含標題、摘要及來源。沒有截斷或改寫摘要，備援複製在開啟的 dialog 內建立暫存欄位，維持完整複製內容。
- t005 套用專屬 1200×630 Open Graph／Twitter 圖卡，其餘主題沿用原圖。直式下載版及生成紀錄在 `../2026-11-09-social-card-t005/`。
- 保留最新 corpus `44bcf90c3c1e5e616b452cde34a7473931f69e58364f66e9146acb7a413dde76`、完整政策資料、Worker bundle 與既有設定，沒有遠端 SQL 或 Secret 變更。
- 193 項測試通過；桌機／手機頁尾及四種複製路徑通過瀏覽器檢查。正式 110 個公開檔案皆 HTTP 200 且雜湊符合發布套件；登入邊界、退役 API 與原設定保持。
- 最終套件、逐檔雜湊與核對結果：`app/output/policy-sharing-deploy-20261109/final-share/`。瀏覽器複製驗證及頁尾截圖：`app/output/playwright/copy-title/`。本輪未 commit 或 push。

## 圖卡下載區首次發布

後續依使用者要求，在 t005 文字區塊下方加入圖卡預覽與直式／橫式 PNG 下載。Production/main：`c16f8265-90d1-4b21-9565-99b9ceaed90d`，以前述 `8751e93d` 為基底，只變更 4 個公開檔案，原首頁、頁尾、複製功能及所有政策與後端均保留。正式 112 個公開檔案核對通過；詳細內容與下載驗證見 `../2026-11-09-social-card-t005/README.md`。

## 統一頁尾與圖卡說明發布

2026-11-09 Production/main：`a84e0945-3384-4b3b-897d-15670b080767`，部署網址 https://a84e0945.puma-note.pages.dev 。本輪發布前發現另一批首頁分享圖更新，已改以其 `f1d7c433-d408-4d86-9419-ecc69e1831e8` 完整套件為基底，保留最新首頁 Open Graph／Twitter 圖與所有其他檔案。

- 首頁、主題館與 86 題採用相同的完整頁尾，由首頁模板共用生成；各主題保留自己的內容更新日期。
- 網站頁尾改為「本站以 AI 輔助整理政策重點，完整政策與最新資訊，請以沈伯洋官網為準。」；品牌、PUMA HUB 致謝、來源及問題回報維持。
- t005 直式／橫式圖卡改為 v4；移除「完整摘要與來源」，加入 AI 整理說明，最後一行明確標示「Puma政策筆記網址：」及本題完整網址。
- 194 項測試通過，桌機與手機頁尾／表單、PNG 實際下載與尺寸核對通過。正式 116 個公開檔案全部 200 且雜湊一致，設定維持。
- 發布內容限 88 份 HTML 與新增 3 個圖卡檔；政策摘要、資料、搜尋 corpus、CSS／JS、Worker 與設定保留。未 commit／push，未變更 publication.json。
- 最新套件與核對結果：`app/output/policy-sharing-deploy-20261109/footer-ai/`；圖卡製作及尺寸紀錄：`../2026-11-09-social-card-t005/README.md`。

## 目前正式版：主題頁分享預覽圖

2026-11-09 Production/main：`312ce9a3-30f8-48cd-90ee-e6b3e416ada7`，部署網址 https://312ce9a3.puma-note.pages.dev 。以 `a84e0945-3384-4b3b-897d-15670b080767` 已驗證套件為基底，只修改 85 個主題頁的 Open Graph／Twitter 圖片網址及替代文字，從舊大船圖改用既有 `og-image-steps-20261109.png` 三步驟圖。t005 保留專屬住宅政策 v4 圖卡。

17 項相關測試與完整靜態建置通過。首頁、t005、摘要、下載檔、頁尾、CSS／JS、資料與 Worker 均逐 byte 保留。發布套件及核對記錄：`app/output/policy-sharing-deploy-20261109/topic-preview/`。正式 116 個公開檔案全部 200 且 SHA-256 一致；另以 facebookexternalhit User-Agent 確認 t001、t005、t086 預覽標籤與三步驟 PNG 可讀。未實際發布社群貼文或驗證既有貼文快取更新時間。
