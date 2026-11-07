#!/usr/bin/env bash
# 離線、人工主導的檢核：逐題把 prompt.txt + packet 交給 Codex CLI，結果存到 review/results.jsonl。
# 用法：bash scripts/run-codex-review.sh [題數]   （不給題數＝全部）
# 先用 `codex exec --help` 確認 -s / -o 參數在你的版本可用。不讀取、不寫入任何金鑰。
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/content/policy-topics/revisions/2026-11-07-summary-500/review"
LIMIT="${1:-100000}"
PROMPT="$(cat "$DIR/prompt.txt")"
OUT="$DIR/results.jsonl"; : > "$OUT"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
n=0
while IFS= read -r packet && [ "$n" -lt "$LIMIT" ]; do
  n=$((n+1))
  id="$(printf '%s' "$packet" | python3 -c 'import sys,json;print(json.loads(sys.stdin.read())["id"])')"
  codex exec -s read-only -o "$TMP" "$PROMPT
$packet" >/dev/null 2>&1 || echo "codex failed on $id" >&2
  # 只取最後一行 JSON（去掉可能的程式碼區塊標記）
  line="$(grep -E '^\s*\{' "$TMP" | tail -n 1 || true)"
  if [ -n "$line" ]; then printf '%s\n' "$line" >> "$OUT"; echo "[$n] $id ok-format"; else echo "[$n] $id NO JSON" >&2; fi
done < "$DIR/packets.jsonl"
echo "done: $n packets -> $OUT"
