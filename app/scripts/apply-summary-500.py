#!/usr/bin/env python3
"""Validate and apply the 2026-11-07 short-summary revision (target ~500 UTF-16 incl. URLs).

Reads content/policy-topics/revisions/2026-11-07-summary-500/proposed-*.json.
Each row: {id, body, source_urls, supports:[{pack_id, unit_id, quote}], reason_short?}.
Checks: IDs/sources exist, official-before-interview, no URLs in body, full copied text
(body + 來源 block with readable URLs) <= 500 UTF-16 units, each quote exists in the original
unit text, every cited URL has a supporting quote, every digit run in the body appears in the
cited original units (or the topic's existing evidence). Writes a check table; with --apply it
updates only share.* in expanded-topics.json. It never calls a network or model API.
"""
import argparse, importlib.util, json, re, sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
REV = APP / 'content/policy-topics/revisions/2026-11-07-summary-500'
TOPICS = APP / 'content/policy-topics/expanded-topics.json'
spec = importlib.util.spec_from_file_location('topic_builder', APP / 'scripts/build-expanded-topics.py')
B = importlib.util.module_from_spec(spec); spec.loader.exec_module(B)
LIMIT, TARGET_MIN = 500, 250


INTERVIEW = re.compile(r'^(?:《|在《|在.{0,12}(?:訪談|專訪|座談|演講|對談|聯訪|記者會|專訪|街講)|.{0,14}(?:訪談|專訪|座談|演講|對談|聯訪|記者會)中|受訪|訪談|商周|房業涵|王淺秋|趙少康|黃暐瀚)')
CAVEAT = re.compile(r'(?:尚未|未列|並非|不是|不代表|仍待|待核實|屬受訪者|沒有列出|沒有說明|沒有金額|不補造|未另行|無法|尚無|需以|需另|須以|頁面沒有|簡報沒有|訪談沒有|並未|不等於)')


def paragraphize(body, sep='\n\n'):
    """Split one dense paragraph into readable paragraphs without changing any wording."""
    sentences = [x for x in re.split(r'(?<=。)', body.replace('\n', '').strip()) if x]
    if len(sentences) < 3:
        return body.strip()
    # Keep reader notes ("這些屬…主張", "頁面沒有列出…") together at the end; wording is unchanged.
    note = re.compile(r'^(?:這些|以上|這是|頁面|簡報|官方頁|本摘要|本文)')
    notes = [x for x in sentences[:-1] if note.match(x) and (CAVEAT.search(x) or re.match(r'^(?:這些|以上)(?:屬|是)', x)) and len(x) <= 70]
    if notes:
        sentences = [x for x in sentences if x not in notes] + notes
    groups, current = [], []
    for i, sent in enumerate(sentences):
        starts_interview = bool(INTERVIEW.match(sent)) and current and not INTERVIEW.match(current[0])
        is_last_caveat = i == len(sentences) - 1 and CAVEAT.search(sent) and current
        too_long = sum(len(x) for x in current) >= 110 and current
        if starts_interview or is_last_caveat or too_long:
            groups.append(''.join(current)); current = []
        current.append(sent)
    groups.append(''.join(current))
    out = []
    for g in groups:
        # a very long single paragraph: break after the semicolon nearest its middle (wording unchanged)
        if len(g) > 130 and '；' in g:
            cuts = [m.end() for m in re.finditer('；', g)]
            mid = min(cuts, key=lambda c: abs(c - len(g) / 2))
            g = g[:mid] + '\n' + g[mid:]
        out.append(g)
    return sep.join(out)


def load_rows():
    rows = {}
    for path in sorted(REV.glob('proposed-*.json')):
        for row in json.loads(path.read_text()):
            if row['id'] in rows:
                raise SystemExit(f"duplicate proposal {row['id']}")
            rows[row['id']] = row
    return rows


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--apply', action='store_true'); ap.add_argument('--allow-partial', action='store_true')
    args = ap.parse_args()
    data = json.loads(TOPICS.read_text())
    catalog = json.loads((B.BASE / 'topic-catalog.json').read_text())
    refs = {t['id']: t['evidence_refs'] for t in catalog['topics']}
    rows = load_rows()
    known = {s['url']: s for t in data['topics'] for s in t['sources']}
    for pack_dir in B.PACKS.values():
        for unit_path in pack_dir.glob('*.json'):
            unit = json.loads(unit_path.read_text())
            known.setdefault(unit['url'], {'title': unit['title'], 'url': unit['url'], 'type': 'official' if unit.get('kind', '').startswith('policy') else 'interview', 'kind': unit.get('kind', '')})
    errors, table = [], []
    for topic in data['topics']:
        tid = topic['id']; row = rows.get(tid)
        if not row:
            if not args.allow_partial: errors.append(f'{tid}: no proposal')
            continue
        extra = row.get('extra_paragraphs', [])
        src = {s['url']: s for s in topic['sources']}
        for e in extra:
            for u in e['source_urls']:
                if u not in src:
                    if u not in known: errors.append(f'{tid}: extra source not in corpus: {u}')
                    else: src[u] = known[u]
        all_sources = list(topic['sources']) + [v for u, v in src.items() if u not in {s['url'] for s in topic['sources']}]
        all_sources.sort(key=lambda s: s['type'] != 'official')
        urls = [all_sources[int(u[1:])]['url'] if re.fullmatch(r's\d+', u) else u for u in row['source_urls']]
        if not 1 <= len(urls) <= 2 or len(set(urls)) != len(urls): errors.append(f'{tid}: needs 1-2 unique source URLs')
        for u in urls:
            if u not in src: errors.append(f'{tid}: URL not among topic sources: {u}')
        types = [src[u]['type'] for u in urls if u in src]
        if types != sorted(types, key=lambda t: t != 'official'): errors.append(f'{tid}: official source must come first')
        body = paragraphize(row['body'])
        if B.utf16(body + '\n\n來源：\n' + '\n'.join(B.readable_url(u) for u in urls)) > LIMIT:
            body = paragraphize(row['body'], '\n')
        if re.search(r'https?://', body): errors.append(f'{tid}: URL inside body')
        text = body + '\n\n來源：\n' + '\n'.join(B.readable_url(u) for u in urls)
        n = B.utf16(text)
        if n > LIMIT: errors.append(f'{tid}: {n} UTF-16 units')
        for n_e, e in enumerate(extra):
            where = f'{tid}/extra/{n_e + 1}'
            if e['section'] not in ('official', 'interview', 'differences'): errors.append(f'{where}: bad section')
            for u in e['source_urls']:
                if e['section'] != 'differences' and src.get(u, {}).get('type') != e['section']: errors.append(f'{where}: wrong source type {u}')
            for ev in e['evidence']:
                pth = B.PACKS.get(ev.get('pack_id', 'main'), Path('/x')) / f"{ev['unit_id']}.json"
                if not pth.is_file(): errors.append(f"{where}: missing unit {ev['unit_id']}"); continue
                un = json.loads(pth.read_text())
                if B.normalized(ev['quote']) not in B.normalized(un['text']) or len(B.normalized(ev['quote'])) < 8: errors.append(f"{where}: quote not in {ev['unit_id']}")
                if un['url'] not in e['source_urls']: errors.append(f"{where}: unit URL {un['url']} not among paragraph sources")
        # supports
        unit_text, covered = '', set()
        for s in row.get('supports', []):
            if str(s['unit_id']).startswith('pdf:'):
                s['pack_id'], s['unit_id'] = 'official-pdf', s['unit_id'][4:]
            p = B.PACKS.get(s.get('pack_id', 'main'), Path('/x')) / f"{s['unit_id']}.json"
            if not p.is_file(): errors.append(f"{tid}: missing unit {s['unit_id']}"); continue
            unit = json.loads(p.read_text()); unit_text += B.normalized(unit['text'])
            q = B.normalized(s['quote'])
            if len(q) < 8 or q not in B.normalized(unit['text']): errors.append(f"{tid}: quote not in {s['unit_id']}: {s['quote'][:40]}")
            linked = {unit['url']}
            for r in refs[tid]:
                if r.get('pack_id', 'main') == s.get('pack_id', 'main') and r['unit_id'] == s['unit_id']:
                    linked.add(r['url']); linked.update(r.get('logical_source_urls', []))
            covered |= set(urls) & linked
            if not (set(urls) & linked): errors.append(f"{tid}: quote unit {s['unit_id']} is not from a cited share source")
        for u in set(urls) - covered: errors.append(f'{tid}: cited URL has no supporting quote: {u}')
        existing = B.normalized(' '.join(e['quote'] for k in ('official', 'interview', 'differences') for p in topic[k] for e in p['evidence']))
        for num in re.findall(r'\d+(?:\.\d+)?', body):
            if num not in unit_text and num not in existing: errors.append(f'{tid}: number {num} not found in cited original text')
        table.append({'id': tid, 'group': topic['group_title'], 'title': topic['title'], 'utf16': n, 'body_chars': len(body),
                      'official': any(src[u]['type'] == 'official' for u in urls if u in src),
                      'interview': any(src[u]['type'] == 'interview' for u in urls if u in src),
                      'urls': [B.readable_url(u) for u in urls], 'supports': len(row.get('supports', [])),
                      'has_official_topic': bool(topic['official']), 'has_interview_topic': bool(topic['interview']),
                      'scope': topic['scope'], 'below_target_reason': row.get('below_target_reason', '' if n >= TARGET_MIN else '(missing)')})
        if n < TARGET_MIN and not row.get('below_target_reason'): errors.append(f'{tid}: {n} < {TARGET_MIN} without below_target_reason')
        if args.apply and not errors:
            for e in extra:
                evs = []
                for ev in e['evidence']:
                    un = json.loads((B.PACKS[ev.get('pack_id', 'main')] / f"{ev['unit_id']}.json").read_text())
                    evs.append({'pack_id': ev.get('pack_id', 'main'), 'unit_id': ev['unit_id'], 'quote': ev['quote'], 'source_url': un['url'],
                                'section_or_timestamp': ev.get('section_or_timestamp', f"閱讀單位{ev['unit_id']}，原文摘錄定位")})
                if e['text'] not in [x['text'] for x in topic[e['section']]]:
                    topic[e['section']].append({'text': e['text'], 'source_urls': e['source_urls'], 'evidence': evs})
            topic['sources'] = all_sources
            topic['share'] = {'body': body, 'source_urls': urls, 'text': text, 'utf16_length': n}
    report = {'status': 'failed' if errors else 'passed', 'topics_checked': len(table), 'errors': errors,
              'min': min((r['utf16'] for r in table), default=0), 'max': max((r['utf16'] for r in table), default=0),
              'mean': round(sum(r['utf16'] for r in table) / len(table)) if table else 0,
              'at_least_400': sum(r['utf16'] >= 400 for r in table), 'rows': table,
              'limitations': ['Quote and number checks prove provenance, not sentence-level semantic correctness.', 'Transcripts were not checked against recordings.']}
    (REV / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'rows'}, ensure_ascii=False, indent=2)[:6000])
    if errors: raise SystemExit(1)
    if args.apply:
        data['content_revision'] = {'date': '2026-11-07', 'note': '短摘要（含來源網址）以500 UTF-16字元為上限，逐題對照原文摘錄。'}
        TOPICS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        print('applied')

if __name__ == '__main__':
    main()
