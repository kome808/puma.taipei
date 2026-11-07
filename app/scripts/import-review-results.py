#!/usr/bin/env python3
"""Validate offline review results (JSONL) and write a human-readable report. Never edits topic data."""
import json, sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
REV = APP / 'content/policy-topics/revisions/2026-11-07-summary-500/review'
src = Path(sys.argv[1]) if len(sys.argv) > 1 else REV / 'results.jsonl'
ids = {json.loads(l)['id'] for l in (REV / 'packets.jsonl').read_text().splitlines()}
results, errors = {}, []
for n, line in enumerate(src.read_text().splitlines(), 1):
    if not line.strip(): continue
    r = json.loads(line)
    if r.get('id') not in ids: errors.append(f'line {n}: unknown id {r.get("id")}'); continue
    if r.get('verdict') not in ('ok', 'needs_fix'): errors.append(f'{r["id"]}: bad verdict'); continue
    for issue in r.get('issues', []):
        if not {'claim', 'problem', 'suggested_fix'} <= set(issue): errors.append(f'{r["id"]}: incomplete issue')
    results[r['id']] = r
missing = sorted(ids - set(results))
lines = ['# 離線檢核結果（待人工審核，尚未套用）', '', f'- 已回覆 {len(results)}／{len(ids)} 題；缺少：{", ".join(missing) or "無"}',
         f'- 需修改：{sum(r["verdict"] == "needs_fix" for r in results.values())} 題；格式錯誤：{len(errors)}', '']
for tid, r in sorted(results.items()):
    if r['verdict'] == 'needs_fix':
        lines += [f'## {tid}'] + [f'- 主張：{i["claim"]}\n  - 問題：{i["problem"]}\n  - 建議：{i["suggested_fix"]}' for i in r.get('issues', [])] + ['']
lines += ['## 格式問題'] + [f'- {e}' for e in errors]
(REV / 'review-report.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines[:5]))
sys.exit(1 if errors else 0)
