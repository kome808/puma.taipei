# Puma政策筆記

網站名稱統一為「Puma政策筆記」（2026-11-07本機修訂，尚未部署）：民間獨立整理的政策與訪談筆記，供理解、核對與研究，並非官方網站。頁面如實標示AI摘要及手動複製流程，不宣稱改名即可符合政策或已取得OpenAI核准。這批修訂尚未部署，既有線上產文API尚未停用。

研究文件入口：[Markdown研究整理](content/policy-topics/markdown/2026-11-07_研究整理/README.md)。網站發布另行處理。

公開網址：[https://puma-note.pages.dev](https://puma-note.pages.dev)。2026-11-07 已新增 Pages 入口，沿用既有 Worker 的線上內容與 API；上方本機文案修訂尚未發布。原 Workers 網址仍保留。

## 政策主題館

主題館 `/topics/` 是主要入口：15類分類卡作為導覽，下方依類直接展開全部86張主題卡，不必先點分類或「顯示更多」。每張卡顯示題目、簡介與「官方政策／訪談補充」來源標記，點選後閱讀官方政策內容、訪談補充、來源差異、短摘要與完整來源。支援分類切換、關鍵字篩選與清除篩選；搜尋時結果緊接在查詢框下方；單題網址如 `/topics/?topic=t021` 可直接開啟。本頁讀取靜態資料，不在查閱時呼叫生成模型。

短摘要（資料欄位仍名為 `share`）的複製內容連同標點、換行與實際來源網址不超過500字元，2026-11-07已逐題對照原文改寫；逐題字元與來源檢查表見 [字元與來源檢查表](content/policy-topics/revisions/2026-11-07-summary-500/字元與來源檢查表.md)。驗證指令：`python3 scripts/apply-summary-500.py`（檢查）與 `--apply`（寫入 expanded-topics.json）。

資料由 `content/policy-topics/expanded-topics.json` 經prebuild匯出至 `public/topics/data.json`。資料含兩個分開的日期：「來源擷取」（2026-11-07）與「內容更新」（`content_revision.date`），都不是網站部署日期。社群回應的正式RAG尚未切換至本主題庫；本輪未改D1/R2資料或AI Search索引。實作與驗證見 [分類頁紀錄](docs/2026-11-07-topic-page.md)。

## 資料檢索與摘要

民間獨立整理沈伯洋的公開政策與訪談。兩個入口共用同一批可追溯來源：

- **主題摘要**：輸入關心的議題，檢索原文，依來源整理段落式摘要。
- **依問題查資料**：輸入問題或需要查核的文字，檢索相關政策／訪談，整理資料摘要。這個入口仍會呼叫OpenAI生成摘要，不能描述成「只查原文、不使用生成模型」。

兩種模式都只有一個「查詢」按鈕，查詢完成直接顯示「資料摘要」欄位；正文、換行與原始來源網址合計不超過500字元，可在同一欄位編輯及手動複製。500字元是上限，不代表每題須寫滿。編輯後超額、刪除來源或只剩來源時，會停用複製；來源被改動時可用「還原摘要」復原。網站沒有代為發文、傳送訊息、主動散布內容、政策圖解或民眾政治傾向分析功能。

摘要下方以「資料來源」列出實際引用的原文，官方政策在前、訪談在後，採單欄排列。通用的網站資料來源與資料更新日期放在結果與引據之後。主標仍為「政策與訪談，一起查個明白。」；品牌名改為「Puma政策筆記」。

介面以奶油紙色、溫暖橘與手繪小角色呈現。頁面常駐標示 [官方政策](https://puma.taipei/policies) 與 [PUMA HUB 訪談／逐字稿整理站](https://puma-hub.pages.dev/#all)；資料最後更新日期由已匯入的語料版本帶出，與網站改版／部署時間分開，避免讓讀者以為內容已重新抓取。

2026-11-07起介面文案改為中性說明（例如「整理資料中…」），不再使用舊的吉祥物口吻，功能名稱清楚描述檢索、摘要與手動複製。生成指示以依來源整理事實為任務，保留條件與版本差異，不代替使用者向第三人發言，不產出投票呼籲、背書、攻擊或依受眾特徵設計說服話術。這些指示不構成全部輸出均正確或用途已獲核准的證明。

既有API的`share`／`reply`識別值、`/api/generate`端點與資料中的`share`欄位名稱保留，以免破壞相容性。顯示名稱修訂不隱藏或否認實際生成流程；舊版發布紀錄仍保留於下方歷史段落。

## 本機使用

需要 Node.js 22.13 以上。

```sh
npm ci
npm run corpus
npm run build
npm run dev -- --key-file /絕對路徑/既有金鑰檔
```

開啟 http://127.0.0.1:8787。金鑰僅在程序記憶體讀取，不寫入專案；也可由啟動環境提供 OPENAI_API_KEY。不得把秘密放進前端、wrangler vars 或版本控制。

本機使用 SQLite 執行與 D1 相同的 SQL 與全文索引，並實際呼叫 OpenAI Responses API。Cloudflare 部署使用 D1、R2、AI Search；AI Search 尚未就緒時，回退至可辨識的站內文字搜尋。

## Cloudflare

隔離資源與匯入程序見 [Cloudflare 設定](docs/cloudflare-setup.md)。2026-11-06 已依使用者同意部署公開測試版，並將既有 OpenAI 金鑰存為 Worker 加密 Secret；前端及專案沒有金鑰副本。

- Pages：`puma-note` 為公開入口，透過 Service Binding 連接既有 Worker，網址列維持 `puma-note.pages.dev`。
- Worker：puma-policy-v1；前端由 Workers Static Assets 提供。
- D1：來源、原文分段、中文 FTS5、請求限額與模型用量。
- R2：衍生語料與索引文件的版本快照。
- AI Search：受管理的混合搜尋，未開放繞過本網站的公開端點。
- OpenAI：固定 gpt-6-luna；API 金鑰僅在後端使用。

公開生成需要 OpenAI 金鑰、Turnstile sitekey/secret 及 rate-limit salt；缺少設定時會停止生成。程式限制每來源的證據數、輸入大小、上下文長度、生成輸出與重試次數，並以 D1 原子計數控制用量。

## 來源與引用

[語料報告](docs/corpus-report.md)記錄原始 203 筆全文如何去重為 98 個來源及搜尋段落。原始下載檔在上層 00_來源資料，不修改或取代。

- 同場訪談的文章、逐字稿與附件以同一入口關聯，避免重複當成獨立證據。
- 官方政策、政策架構、逐字內容與整理文章分別標示。
- 模型只回傳正文與已提供的證據 ID；後端查核 ID、依原始來源帶入網址，不使用模型編造的連結。
- 500 字元採保守 UTF-16 計數，emoji 不會繞過限制；原始網址僅轉成等價的可讀中文路徑。超額最多縮稿一次，仍超額就不回傳可複製稿。
- 引據存在不代表每句 AI 解讀都正確。摘要須由使用者核對，尤其是數字、語者、提案與施行狀態。
- 圖片與 PDF 沒有 OCR／全文抽取；逐字稿未逐句與影音核驗。原稿的錯字、整理性文字與時間碼限制保留在查核註記。

## 資料使用

網站資料庫不儲存使用者輸入的文字原文。生成摘要時會把輸入、相關來源與必要查核註記送至OpenAI API，並設定store:false。資料庫僅記錄請求編號、時間、任務、token用量與預估模型費用；防濫用計數使用按日加鹽的位址雜湊，不建立使用者政治立場檔案。使用期間會清理過期計數及30天以前的用量紀錄，沒有另行建立排程。

## 驗證

```sh
npm test
npm run build
node --import tsx scripts/smoke-live.mjs /絕對路徑/既有金鑰檔
```

最後一項會產生真實 API 用量，報告輸出至忽略版控的 artifacts/smoke-live.json。測試涵蓋字數邊界、來源拒絕與去重、未知引用、超額重試、無相關依據、輸入限制、跨來源請求及公開生成設定。

2026-11-06：65 項自動測試與 production build 通過；前輪 6 個真實 Luna 情境通過，包括都更退場與換屋、初始房源、運動、育兒、無依據與提示注入。桌面及 390px 手機介面已實測。公開健康檢查與兩種混合搜尋成功，無 Turnstile 驗證的生成請求回傳 403；安全的檢查結果保存在 artifacts/public-check.json，瀏覽器截圖在 output/browser/。

手機驗證修正另涵蓋：20 秒後取得驗證仍可成功、60 秒逾時後建立新驗證、取消與舊 callback 隔離、互動時延長至 180 秒，以及 SDK 載入失敗後重新載入。公開版採 Managed 驗證，啟動後設定為顯示於查詢按鈕下方；網站設定、驗證程式載入、驗證與整理回答分開顯示進度。新版兩種產文流程與取消後重查已實測，含來源分別 295／187 字元，320px／390px 均未水平溢出。檢查記錄為 artifacts/turnstile-public-check.json；這是手機尺寸測試，未在使用者實際手機或慢速網路上驗收。

都更回歸案例會保留問題要求的退場與換屋原文，避免一般背景段落先耗盡 3,200 字上下文；程式也阻擋以檢索片段推斷「原文沒說過」的結論。這些檢查無法替代逐句人工核對。

訪談搜尋支援將從段落中途開始的 AI Search chunk 對回完整原文，要求足夠的逐字重疊，避免因段首不在 chunk 裡而漏掉訪談。「第一批房子從哪來」等問題也會以土地／房源語意排序及選取上下文。公開原句「無限都更一開始的房子要怎樣來」已產出含 TODAY 訪談來源的 213 字元貼文。初次 live 驗證發現的既有來源數重試提示不足也已補上明確回饋，仍維持最多兩次生成；初次報告另存 artifacts/smoke-live-housing-first-attempt1.json，最新六情境報告為 artifacts/smoke-live.json。

Stageshow 的使用評估與實作分工見 [第一版實作計畫](docs/2026-11-06-v1-plan.md)：這版採其結果聚焦與層級原則，正式操作區顯示真實 API 結果。

## 現成 RAG 結果保留

沿用 Cloudflare AI Search + OpenAI Luna，未建立人工問答資料庫或新增每題查詢改寫。managed 搜尋結果與 raw BM25 以來源層級 reciprocal rank fusion 合併，再在各來源保留原文段落；不再用 fallback 的主題 anchor 或關鍵字命中數篩掉 managed 候選。最多 6 個候選來源、8 段；先保留不同來源，再補第二段，生成仍受 3,200 字原文／最多 6 段／最多引用 2 來源／完整 500 字元限制。

8 個實際 Cloudflare payload 的重播中，預期來源進入生成 context 的題數由 6/8 改為 8/8；涵蓋房源、通學、托育、青年基金、都市微森林、公務員、城市外交及客語。這是代表案例結果，不是全面命中率。真實 Luna 產文均含來源且 ≤500 字元；人工查核發現的國外例子距離、弱勢提撥金額與第三來源漏列已補一般性指示並重測。模型先輸出 evidenceIds 再寫 body，保留所有既有引用／字數守門；這仍不是逐句語意正確的程式保證。

證據：artifacts/managed-rag-before.json、managed-rag-after.json、managed-rag-live.json、managed-rag-public-check.json。原始失敗與補驗報告保留於同目錄；59 tests/build 通過，後續引用輸出順序修改另以 13 項生成與 API 測試通過。語料與網站外觀未變。

## iPhone Safari 驗證等待回報

使用者於正常網路的 iPhone Safari 回報：沒有方框，僅停在安全驗證中。已修正兩個可重現的網頁等待路徑：設定請求含 body 讀取受 15 秒 deadline 限制；互動驗證的 timer 只能延長一次，整個前置驗證流程受 180 秒 deadline 限制。deadline 會 reject 並取消子請求，即使請求忽略 abort 也能恢復介面，晚到結果不會送出生成。

widget 設定 appearance=always，並在進入驗證時捲到可見範圍；重試失敗附上僅限六位數的驗證代碼。沒有放寬後端 Siteverify、hostname/action 驗證或配額。65 tests/build 通過；本機 HTTP fixture 故意不回覆 config，UI 在 15 秒後恢復查詢／再試一次，generateRequests=0。公開站兩次真實驗證及生成成功，含來源 238／143 字元；尚未在使用者實際 iPhone Safari 驗收，也未以本機測試確認其實際卡住原因。

證據：artifacts/verification-stall-uat.json、verification-stall-public-check.json、verification-stall-red.txt；output/browser/config-deadline-recovered.png 與 verification-recovered-mobile-result.png。
