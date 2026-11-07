# 政策主題內容

目前閱讀版：[Markdown研究整理索引](markdown/2026-11-07_研究整理/README.md)。依使用者最新決定，先整理本機文件，後續另行處理網站發布。包含15類86題的逐題說明與合訂本、來源索引，以及223份保存文字；不匯出社群分享稿。原有網站與API未在這次修改或停用。

重建Markdown：在專案根目錄執行 `python3 app/scripts/export-research-markdown.py`。只讀取現有資料，不呼叫模型、修改網站資產或部署。

## 既有結構化資料與網站狀態

`expanded-topics.json` 是86題的展開內容，保留官方做法、訪談／活動補充、來源差異及原文摘錄。`share.text` 已合併正文與原文網址，`share.utf16_length` 為包含換行的完整字數；500字元限制不能只驗證正文。

重建及驗證：在專案根目錄執行 `python3 app/scripts/build-expanded-topics.py`。工具不會呼叫模型API、修改原始下載快照或部署網站。可讀預覽位於 `app/output/policy-topics/index.html`，檢查結果為同目錄 `validation.json`。

`rag/` 是供後續索引的衍生主題文字；不是官方原文。正式使用時必須以topic ID連回本JSON中的原文網址、來源類型、版本差異及evidence，不得把整理稿本身冒充原始出處。不應將這86份文件一次全部塞入生成prompt。

公開視覺主題頁已發布至 https://puma-policy-v1.kome808.workers.dev/topics/ ，以Cloudflare靜態資產中的精簡JSON提供分類與關鍵字搜尋；D1/R2主題資料匯入與Cloudflare AI Search索引切換尚未執行。原有來源庫繼續保留，以便未命中、細節追問及版本對照時回查。來源快照為2026-11-07，並非即時更新。
