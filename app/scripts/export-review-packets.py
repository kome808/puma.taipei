#!/usr/bin/env python3
"""Export per-topic review packets for an OFFLINE, human-led check (e.g. with Codex CLI on a local machine).

Each packet holds the short summary, the cited original excerpts (with surrounding context from the
downloaded source units) and the official paragraphs. Nothing is sent anywhere by this script and it
never reads keys. Results are reviewed by a person; nothing is written back to expanded-topics.json.
"""
import importlib.util, json, re
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
REV = APP / 'content/policy-topics/revisions/2026-11-07-summary-500'
spec = importlib.util.spec_from_file_location('b', APP / 'scripts/build-expanded-topics.py')
B = importlib.util.module_from_spec(spec); spec.loader.exec_module(B)
rows = {}
for f in sorted(REV.glob('proposed-*.json')) + sorted(REV.glob('revise-*.json')):
    for r in json.loads(f.read_text()):
        rows.setdefault(r['id'], {'supports': []})
        rows[r['id']]['supports'] += r.get('supports', []) + r.get('supports_add', [])
data = json.loads((APP / 'content/policy-topics/expanded-topics.json').read_text())
out = REV / 'review/packets.jsonl'
with out.open('w') as fh:
    for t in data['topics']:
        ex = []
        for s in rows[t['id']]['supports']:
            pack, uid = ('official-pdf', s['unit_id'][4:]) if s['unit_id'].startswith('pdf:') else ('main', s['unit_id'])
            unit = json.loads((B.PACKS[pack] / f'{uid}.json').read_text())
            text = re.sub(r'\s+', ' ', unit['text']); q = re.sub(r'\s+', ' ', s['quote']); i = max(text.find(q[:25]), 0)
            ex.append({'unit': s['unit_id'], 'url': unit['url'], 'quote': s['quote'], 'context': text[max(0, i - 400): i + len(q) + 400]})
        packet = {'id': t['id'], 'title': t['title'], 'scope': t['scope'], 'summary': t['share']['text'], 'summary_urls': t['share']['source_urls'],
                  'official_paragraphs': [p['text'] for p in t['official']], 'interview_paragraphs': [p['text'] for p in t['interview']], 'excerpts': ex}
        fh.write(json.dumps(packet, ensure_ascii=False) + '\n')
print(f'wrote {out} ({len(data["topics"])} packets)')
