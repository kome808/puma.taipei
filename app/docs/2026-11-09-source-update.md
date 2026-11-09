# 2026-11-09 來源更新發布

已發布至 https://puma-note.pages.dev 。Pages Production/main：`97588618-ba7c-4520-9026-8e90ecbe77e1`；部署網址 https://97588618.puma-note.pages.dev 。前版 `55f8dcf0-a75c-4bf5-b991-2fca8967c6d3` 保留。未commit、push或修改publication.json。

兩位Agent重抓並比對官方政策及PUMA HUB。新收錄官方住宅政策（頁面自述發布11/07），完整閱讀正文及4張圖後，獨立覆核並更新t004／t005；HUB的77入口、195資源完全未變。新快照 `00_來源資料/2026-11-09_更新檢查/` 有340來源／221全文，詳細差異及限制見其 `檢查/更新報告.md`。其餘84題逐物件未變；仍15類86題。

兩題摘要403／424字元（含原始來源），保留提案／目標語氣及官方在前。來源檢查日11/09；兩題內容日11/09、其餘84題仍11/07，公開JSON、頁尾及JSON-LD一致。每題日期優先使用topic.content_updated，舊題由原始generated_at保留既有內容日，避免將全庫比對日期當作每題改寫日。

研究版另存 `content/policy-topics/markdown/2026-11-09_研究整理/`，224來源文字、177引文、1,041本機連結通過；舊11/07研究版與原始快照全部保留。

## 保護平行首頁工作

發布前實查正式站仍是原船圖版，本機則有未上線的三步驟首頁／CSS／新圖片。18個其他資產逐一比對，僅CSS及新圖片不同。因此本次不從本機static-dist整包直接發布，改由 `scripts/build-source-update-release.mjs` 複製建置包，套用保存的正式首頁與CSS，更新資料版本／日期／Schema，排除未上線新圖片。沒有改回本機首頁原檔。

正式原貌保存在 `content/policy-topics/revisions/2026-11-09-source-update/production-before/`。發布包首頁除資料／日期外與基準DOM一致、CSS相同，89個HTML引用的資源均存在。後續接手不可把本次未發布的首頁工作當成已上線，也不可用舊Git提交回退其他已部署修改。

重建本次發布包（先完成build:static，輸出目錄必須尚不存在）：

```sh
node scripts/build-source-update-release.mjs content/policy-topics/revisions/2026-11-09-source-update/production-before /private/tmp/puma-source-release-20261109-2
```

## 索引與服務

新版搜尋corpus為 `44bcf90c3c1e5e616b452cde34a7473931f69e58364f66e9146acb7a413dde76`。先預置86題，再發布Pages，確認新版canonical後切active；舊86題索引保留。既有98原始來源、1,561段落及1筆回報保留；舊原文RAG未重建。沒有啟用生成或語意搜尋，沒有R2／AI Search匯入、新服務、Secret或排程修改。

D1遠端bulk importer不接受顯式BEGIN／COMMIT。首次匯入被拒後唯讀確認資料仍原樣；本次stage SQL排除active-meta更新與交易包裝，改由匯入器管理交易，86題匯入成功後才切active。用帶參數的D1 API時，一次送一條SQL，不混多條statement。

## 驗證

- `npm test`：191 passed、0 failed；`npm run build:static`成功。
- 新增逐題日期測試確認：重新檢查來源不會改掉未修改題目的內容日期。
- 本機真實D1 API：「老宅行動服務團」回t004、「4000戶」回t005；HTTP200且新版corpus一致。
- 本機1440／390px兩題複製逐字一致、來源順序正確，無橫向溢出。
- 正式88頁與18資產皆200、逐byte符合核定發布包；兩題403／424字元。
- 遠端D1 active與Pages manifest一致、新舊各86題，t004／t005payload為新版。
- 正式reportsOpen與analyticsEnabled仍true；generationEnabled與semanticSearchEnabled仍false。
- 未送正式測試回報、未以正式搜尋API灌測試查詢或統計；正式驗證使用原始HTTP及私下唯讀SQL。

機讀證據在 `content/policy-topics/revisions/2026-11-09-source-update/`：before-expanded-topics.json、validation.json、package-validation.json、production-verification.json與release-status.json。

未驗證：實體iPhone／Safari、影音逐句聽校、Google重抓及索引；政策數字未獨立核實，約4,000戶與5–10%不得寫成既有成效或已開放補助。
