#!/usr/bin/env python3
"""找出主題頁顯示文字（題目、簡介、短摘要）中，在該題來源原文裡找不到相近文字的句子。

做法：每題收集其 sources 網址對應的全部原文單位（主包與官方 PDF 包），
把每句切成 3 字片段，計算有多少片段出現在原文中。覆蓋率低的句子列出，
並標出找不到的連續片段，供人工判斷是改寫、綜合還是無依據。這只是篩檢，不會修改資料。
"""
import importlib.util, json, re, sys
from pathlib import Path
APP = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('B', APP / 'scripts/build-expanded-topics.py')
B = importlib.util.module_from_spec(spec); spec.loader.exec_module(B)
data = json.loads((APP / 'content/policy-topics/expanded-topics.json').read_text())
by_url = {}
for pack in B.PACKS.values():
    for p in pack.glob('*.json'):
        u = json.loads(p.read_text()); by_url.setdefault(u['url'], []).append(u['text'])
keep = lambda s: re.sub(r'[^\w]', '', s.replace('臺', '台')).lower()
def grams(s, n=3): s = keep(s); return [s[i:i+n] for i in range(len(s) - n + 1)]
threshold = float(sys.argv[1]) if len(sys.argv) > 1 else 0.6
out = []
for t in data['topics']:
    urls = {s['url'] for s in t['sources']} | set(t['share'].get('source_urls', []))
    src = keep(''.join(x for u in urls for x in by_url.get(u, [])))
    fields = [('title', t['title']), ('intro', t['intro'])] + [('share', x) for x in re.split(r'(?<=[。！？])', t['share']['body'].replace('\n', '')) if x.strip()]
    for field, sent in fields:
        g = grams(sent)
        if not g: continue
        hit = [x in src for x in g]
        cov = sum(hit) / len(g)
        if cov < threshold:
            s = keep(sent); miss, run = [], ''
            for i, h in enumerate(hit):
                if not h: run = run + s[i+2] if run else s[i:i+3]
                elif run: miss.append(run); run = ''
            if run: miss.append(run)
            out.append({'id': t['id'], 'field': field, 'coverage': round(cov, 2), 'sentence': sent, 'missing': [m for m in miss if len(m) >= 4]})
print(json.dumps(out, ensure_ascii=False, indent=1))
print(f'# {len(out)} sentences below {threshold}', file=sys.stderr)
