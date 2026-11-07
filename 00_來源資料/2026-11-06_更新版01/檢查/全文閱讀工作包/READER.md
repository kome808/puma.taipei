# 全文閱讀工作規格（內部工作檔）

使用者要求：閱讀所有已下載更新的官方政策、訪談、附件，再歸納可供網站選取的主題。不是看標題或搜尋命中片段。各批讀者共同完成全文，不必每人重讀所有批。

## 操作

0. 每完整讀完約4個units就更新 reviews/bNN.progress.json，內容只需已完整讀的unit_ids，讓root掌握進度。不要尋找send_message工具；LUNA worker未提供該API。全部完成後才輸出正式bNN.json並final回報。
1. 僅處理指派批次 batches/bNN.json；依序讀 units/<unit_id>.json 的完整 text 與 metadata。可每次讀四個 unit。若使用 functions.exec，第一行必須設 // @exec: {"max_output_tokens": 65000}，內層 exec_command 也設 max_output_tokens: 60000；否則外層預設10000可能截掉內層輸出。遇到任何截斷，補讀全部未出現文字。不能只搜尋關鍵字或看頭尾。
2. documents.json 有來源 metadata 與所有原 Markdown 連結。unit保留每個連結的顯示文字，網址移入links，避免反覆讀幾千個相同YouTube網址。重複段落僅在同一邏輯來源可證明完全相同時剔除；其他獨特文字全部必讀。
3. 逐段讀後歸納主題，不套預設類別。政策與受訪發言均是來源主張；並非已核定實施。區分本人、主持人、其他來賓、文章編者、個人故事／國會國際公共議題與市政政策。未可靠標記講者的字幕不能推定為本人承諾。保留數字的前提、試辦、舉例與時間脈絡。eligibility的shareable代表能以「提出／主張」忠實整理，不代表已實施或外部事實均已驗證；不要只因來源未核影音就把所有市政主題都排除。needs_verification保留給講者不明、關鍵數字衝突或支持不足等實質問題。譯稿與字幕不是兩份獨立證據。
4. 粒度：一個民眾可理解的具體問題。不要整場訪談只做一題，也不要機械地將每句拆題。不產生政治說服宣傳稿；這是來源內容整理。不要修改網站、部署、呼叫付費API、讀任何金鑰、存取Notion。
5. 你不是單獨在codebase中，不得修改或撤回其他人的檔案。只擁有 reviews/bNN.json。可建立僅自己使用的暫存讀取腳本。JSON寫好後自行核對指定units都在ledger且sha/range相符。

## 輸出

{
  "batch_id":"bNN",
  "read_units":[{"unit_id":"u0001","doc_id":"d0001","start":0,"end":6000,"sha256":"...","read_fully":true}],
  "source_readings":[{"doc_id":"d0001","title":"...","url":"...","summary":"...","attributable_claims":["..."],"caveats":[],"topic_keys":[]}],
  "topics":[{"working_title":"...","question":"...","points":["..."],"source_refs":[{"unit_id":"u0001","doc_id":"d0001","url":"...","section_or_timestamp":"...","speaker":"...","support_excerpt":"短原文"}],"eligibility":"shareable|context|needs_verification","possible_duplicates":[]}]
}

文字務求精簡：每份source summary約一兩句，claims最多3項；只記真正影響解讀的caveat，通用未核影音警語不必每題重複。每題points通常2–4點，每點約70字內。這是閱讀筆記，不是最終長篇文章。

每個doc至少有閱讀摘要；沒可分享內容也要列為context。每個主題有真實unit、doc、url、位置、講者與短原文。support_excerpt 必須直接copy原文連續8–30字，不可改寫、合句或用省略號代替；points才是白話整理。數字不靠記憶補。最終只回報輸出檔、閱讀units與主題數、值得root注意的限制。root會做跨批次整合，讀者不必自行發布或建立正式文件。
