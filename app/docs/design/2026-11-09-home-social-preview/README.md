# 首頁三步驟分享預覽圖

2026-11-09，依使用者要求，首頁網址分享到Threads時，改用目前「政策分享，3 步驟就上手」插圖。

正式檢查確認首頁已顯示三步驟，但Open Graph／Twitter仍指向11/08大船PNG；本輪直接更換網站標籤，未以快取猜測代替查核。

- 使用圖：`app/public/og-image-steps-20261109.png`，1200×630 PNG、279,382 bytes。
- 正式圖片：https://puma-note.pages.dev/og-image-steps-20261109.png
- SHA-256：`f9fc1bbae571e9971e723739b574db5d4c3e3e9e49878c436b635c7a75d3007d`。
- 插圖沿用 `public/topics/policy-sharing-steps-20261109.webp` 原檔，未重新生成；僅以HTML排版加入Puma政策筆記、既有三步驟標題／步驟名稱、網址與非官方說明。
- 可重製排版：`scripts/og-image-steps.html`，以Chromium1200×630、CSS scale、等待字型及圖片decode後匯出。從app目錄HTTP預覽開啟。
- 本輪只更新首頁與 `/topics/` 的分享標籤，另新增PNG；各政策頁及t005專屬圖卡保持原正式版。舊船圖、舊模板及所有先前資產保留。

Pages Production/main：`f1d7c433-d408-4d86-9419-ecc69e1831e8`，部署網址 https://f1d7c433.puma-note.pages.dev 。以前版 `c16f8265-90d1-4b21-9565-99b9ceaed90d` 的已驗證完整發布包為基底，只變更 `index.html`、`topics/index.html`、新增PNG共3個檔案，其他113個發布檔案逐byte保留。未將本機另一批t005 v3工作帶入本次發布。

12項現有資料／首頁分享標籤測試通過；圖片完成目視檢查，尺寸、PNG檔頭與大小通過。發布前112個公開檔案與基準完全相同；發布後113個公開檔案全部200且與發布包SHA一致。以facebookexternalhit User-Agent讀取兩個入口與PNG均成功，標籤指向新圖、image/png、圖片hash正確。這只證明該HTTP請求可讀，未實際發布Threads貼文、未驗證Meta實際重抓或既有貼文卡片更新時間。

政策資料、搜尋corpus、Worker、CSS／JS、圖卡下載區與API設定不變；沒有遠端SQL、Secret或排程變更，未commit／push、未改publication.json。

發布包、逐檔hash及HTTP核對記錄：`app/output/home-social-preview-20261109/`（忽略版控）。未來發布其他工作請以上述最新正式版為基底，避免重新帶回舊首頁預覽標籤。

後續 2026-11-09 主題頁預覽更新：`312ce9a3-30f8-48cd-90ee-e6b3e416ada7`。其餘 85 個主題頁亦改用本張三步驟預覽圖；t005 保留住宅政策專屬 v4 圖卡。此部署保留中間版 `a84e0945` 的 AI 說明及統一頁尾。最新套件與核對記錄：`app/output/policy-sharing-deploy-20261109/topic-preview/`。
