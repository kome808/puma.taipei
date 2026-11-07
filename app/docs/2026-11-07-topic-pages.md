# 首頁標題與獨立主題網址（本機待發布）

首頁依使用者提供文字改為：

- 主標：分享洋流小物，更要分享洋流政策
- 副標：沈伯洋講政策，小水滴們用力分享政策

移除原本的「✳ 政策主題館」小標與「15類議題，86個主題，一次看見。」大標。分類及主題數仍作為資料統計，民間／非官方說明保留。

## 獨立網址

86題各自產生 `topics/tNNN/index.html`，例如 `/topics/t065/`。卡片改為一般連結，點擊直接前往該題；每頁在HTML中即包含固定摘要與來源，無須JavaScript或搜尋API才能閱讀。

- 每題有獨立的title、h1、canonical、og:title與og:url；預覽圖沿用共用品牌圖。
- 頁面只顯示既有短摘要，來源連結只列一次，提供「複製摘要與來源」與「複製本題連結」。後者複製正式canonical網址，不把本站連結另外塞進500字摘要。
- 回報功能保持原設定；只有展開回報表單才讀設定，不在開頁時搜尋或生成。
- 舊 `/topics/?topic=t065`仍保留原有開啟方式。不存在的靜態路徑使用404頁，不假裝顯示另一題。
- 產物同時加進Worker的 `dist/` 與Pages的 `static-dist/`，不改API路由、資料庫或原始資料。

`scripts/build-topic-pages.mjs`從同一份公開JSON產頁，避免86份來源文字各自維護。`npm run build`透過postbuild加入主題頁；Pages建置直接呼叫相同產生器。所有動態文字與網址均做HTML escaping。

## 驗證

兩種建置成功；完整126項測試通過。新測試核對86個輸出路徑、各自metadata、摘要文字／來源一致性及HTML注入防護。

本機預覽確認：首頁文字與使用者提供內容一致，86張卡片的網址均唯一，點擊會前往獨立主題頁；375字的t065摘要複製與畫面一致，本題連結複製為正式canonical。使用替身驗證剪貼簿與失敗提示，沒有讀寫系統剪貼簿。開啟主題頁沒有API請求；展開回報只讀一次config，匿名送出保持隱藏；未知主題回404，舊query連結仍可用。390px視窗沒有橫向溢出，未作實體iPhone Safari或社群平台預覽驗收。

[首頁桌面](screenshots/2026-11-07/topic-pages-home-desktop.png)、[首頁手機尺寸](screenshots/2026-11-07/topic-pages-home-mobile.png)、[主題頁桌面](screenshots/2026-11-07/topic-page-desktop.png)、[主題頁手機尺寸](screenshots/2026-11-07/topic-page-mobile.png)。

本次未部署；正式站仍為246a297。這批變更包含上一輪尚未發布的「只顯示短摘要」調整，需依使用者既有確認規則再發布。摘要正文、公開JSON、D1索引、Secret及publication.json均未變動。
