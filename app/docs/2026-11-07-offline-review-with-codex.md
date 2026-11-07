# 用 Codex CLI 做離線比對檢核（人工主導）

目的：用模型當「第二雙眼睛」，逐題比對短摘要與原文摘錄，找出數字、主體、提案／已實施混淆、訪談與官網不一致等問題。**不是**公開互動系統、**不**產生或調整競選訊息、**不**自動發布或分眾投放。

## 範圍與界線
- 只在你自己的電腦、後台、離線執行；結果是人工審核用的清單，不會自動改資料，也不會在網站上即時回答。
- 前台維持靜態：審核通過後，只把人工確認的修訂寫回 `revise-*.json`，再用 `scripts/apply-summary-500.py` 驗證／套用。
- 不把金鑰放進專案、`wrangler`、前端或版本控制；用你本機已登入的 Codex CLI。若透過 API，請帶 `safety_identifier`（不含個資的穩定雜湊），並對輸入／輸出做 Moderation。這個容器無法連到 OpenAI，本輪沒有實際執行。
- 這輪不宣稱用途已獲平台核准；如收到平台警示，請先依平台通知處理。

## 步驟
1. `python3 scripts/export-review-packets.py` → `content/policy-topics/revisions/2026-11-07-summary-500/review/packets.jsonl`（每題一行：短摘要、官方／訪談段落、原文摘錄與前後文）。
2. 在本機對每行執行 Codex CLI，要求輸出一行 JSON 到 `review/results.jsonl`。建議提示：

```
你是資料查核員。只依下列 packet 內的原文摘錄與官方段落檢查「summary」，不得引入外部知識或新增主張。
規則：一、官網說法優先，訪談與官網有出入時以官網為準；二、候選人的提案不可寫成已實施；三、數字、主體、條件必須與摘錄一致；四、不得出現投票呼籲、背書、勸說語氣；五、不要改寫風格。
輸出單行JSON：{"id":"tNNN","verdict":"ok|needs_fix","issues":[{"claim":"摘要中的句子","problem":"與哪段摘錄不符","suggested_fix":"最小修改建議"}]}
```

3. `python3 scripts/import-review-results.py` 驗證格式並產生 `review/review-report.md`，由人逐題判斷是否採納。
4. 採納的修訂寫入 `revise-*.json`（保留原文摘錄），執行 `python3 scripts/apply-summary-500.py --apply`、`npm test`。
