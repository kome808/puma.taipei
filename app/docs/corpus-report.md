# 語料建置報告：2026-11-06-v1

本報告由 app/scripts/build-corpus.mjs 依 2026-11-06 來源快照產生；原始快照未修改。

## 收錄數量

| 項目 | 數量 |
|---|---:|
| 全文輸入紀錄 | 203 |
| 官方政策／框架來源 | 24 |
| 邏輯訪談／活動入口（以 entries.json 為準） | 74 |
| 語料來源（canonical sources） | 98 |
| 語料段落 | 1561 |
| 語料字元（Unicode code points） | 815893 |

## Canonical 選擇

每個 entries.json 入口只建立一個 interview source。若有可用逐字稿，優先在逐字稿頁／附件中選取清理後最長版本；沒有可用逐字稿時，選取文章／長文版本。文章、逐字稿與附件的其他版本只保留為 related URL 或選擇統計，不重複建立來源。

| 選用來源 kind | 數量 |
|---|---:|
| policy_index | 1 |
| policy_detail | 15 |
| framework_page | 3 |
| heart_axis | 5 |
| interview_article | 37 |
| transcript_page | 21 |
| transcript_attachment | 16 |

| 入口 transcript_status | 數量 |
|---|---:|
| found_inline | 22 |
| found_page | 33 |
| not_found | 19 |

## 排除與去重

| 排除原因 | 紀錄數 |
|---|---:|
| duplicateArticleTranscriptAttachment | 102 |
| nonCanonicalTextRecords | 105 |
| unlinkedOrIndexRecords | 1 |

以上是不同判定口徑的報告統計，可能同一紀錄同時落在候選版本去重與 canonical 排除分類；各列不可相加回推全文輸入紀錄總數。

未選用的文章／逐字稿附件不代表內容不存在；它們是同一個邏輯入口的重複版本。官方圖片與 PDF 未在文字快照中 OCR／抽取，因此不會出現在此語料。

## 分段與搜尋

段落以 Markdown 章節、空行、講者／時間碼及句末標點為邊界，目標約 450–900 個 Unicode 字元；不為湊長度切斷完整句子。此次共有 728 段低於 450 字（多為短來源或章節邊界），0 段超過 900 字（長句或原稿無安全句界）。
Chinese tokens 同時保留詞典式多字詞、單字 fallback 與相鄰雙字 bigram，並以空白分隔供 D1 FTS5 使用。

## 限制與查核狀態

- 全部原始文字紀錄的快照狀態是「已下載、未事實查核」；本語料不把候選人／來賓的說法轉成已證實事實。
- 訪談逐字稿沒有逐句與影音核對；自動辨識錯字、缺句、時間碼與講者標示疑點依來源備註保留。
- 訪談摘要／整理文章與逐字稿是不同內容版本；引用時需標示是摘要、整理或逐字稿，不能把摘要當成逐字引文。
- PDF、圖片及其他二進位附件沒有 OCR／全文抽取，故未納入 passage；其原始連結可留在來源快照中。
- 來源 URL 使用原始公開政策頁或原始 hub 文章／逐字稿頁；下載用的 .md、.json、.docx 不作 canonical source URL。
- 本快照也包含其他原始公開訪談站的來源頁；canonical URL 未改寫成不存在的 hub 替代網址。主機分布如下：

| canonical URL host | 來源數 |
|---|---:|
| puma.taipei | 24 |
| puma-shen-interview.pages.dev | 33 |
| puma-hub.pages.dev | 36 |
| shenboyang-interview.pages.dev | 1 |
| puma-interview-2026.pages.dev | 1 |
| puma-taipei-ocean-current.pages.dev | 1 |
| puma-transcript.pages.dev | 1 |
| puma-scholars-2026.u8901006.workers.dev | 1 |

- 本輸出是 server-side corpus；corpus.json、D1 SQL 與搜尋 Markdown 不包含任何 API 金鑰或秘密。
