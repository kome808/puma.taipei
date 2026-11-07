#!/usr/bin/env python3
"""Compile source-backed editorial batches without changing the live corpus."""
import argparse
import hashlib
import html
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zoneinfo import ZoneInfo

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
BASE = ROOT / '00_來源資料/2026-11-06_更新版01/檢查/全文閱讀工作包'
CONTENT = APP / 'content/policy-topics'
PACKS = {'main': BASE / 'units', 'official-pdf': ROOT / '00_來源資料/2026-11-06_更新版01/補充文字/全文閱讀工作包/units'}
OUT = APP / 'output/policy-topics'


def utf16(text):
    return len(text.encode('utf-16-le')) // 2


def normalized(text):
    return re.sub(r'\s+', '', text)


def readable_url(url):
    # Decode the Chinese path while retaining reserved URL delimiters.
    return re.sub(r'(?:%[0-9a-fA-F]{2})+', lambda m: unquote(m[0]) if not re.search(r'%(?:2[fF]|3[fF]|23|26|3[dD]|25)', m[0]) else m[0], url)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--allow-partial', action='store_true')
    args = parser.parse_args()
    catalog = json.loads((BASE / 'topic-catalog.json').read_text())
    originals = {t['id']: t for t in catalog['topics']}
    groups = {g['id']: g['title'] for g in catalog['groups']}
    drafts = []
    for path in sorted((CONTENT / 'batches').glob('batch-*.json')):
        rows = json.loads(path.read_text())
        if not isinstance(rows, list):
            raise ValueError(f'{path}: expected JSON array')
        drafts.extend(rows)
    errors, topics, seen, units, added_evidence = [], [], set(), {}, []
    known_sources = {s['url']: dict(s) for t in catalog['topics'] for s in t['sources']}
    for pack, directory in PACKS.items():
        for path in directory.glob('*.json'):
            unit = json.loads(path.read_text())
            units[(pack, unit['unit_id'])] = unit
            known_sources.setdefault(unit['url'], {'title': unit['title'], 'url': unit['url'], 'type': 'official' if pack == 'official-pdf' or unit.get('kind', '').startswith('policy') else 'interview', 'kind': unit.get('kind', '')})
    checked_units = set()
    for draft in drafts:
        tid = draft.get('id')
        if tid not in originals or tid in seen:
            errors.append(f'{tid}: unknown or duplicated topic')
            continue
        seen.add(tid)
        original = originals[tid]
        sources = dict(known_sources)
        for ref in original['evidence_refs']:
            if ref['url'] not in sources:
                official = ref.get('kind', '').startswith('policy')
                sources[ref['url']] = {'title': ref['url'], 'url': ref['url'], 'type': 'official' if official else 'interview', 'kind': ref.get('kind', '')}
        selected = set()
        paragraph_count = 0
        for section in ['official', 'interview', 'differences']:
            paragraphs = draft.get(section)
            if not isinstance(paragraphs, list):
                errors.append(f'{tid}: {section} must be an array')
                continue
            for n, para in enumerate(paragraphs):
                where = f'{tid}/{section}/{n + 1}'
                covered_urls = set()
                paragraph_count += 1
                if not para.get('text', '').strip() or not para.get('source_urls') or not para.get('evidence'):
                    errors.append(f'{where}: missing text, sources or evidence')
                for url in para.get('source_urls', []):
                    source = sources.get(url)
                    if not source:
                        errors.append(f'{where}: source outside downloaded corpus: {url}')
                    elif section != 'differences' and source['type'] != section:
                        errors.append(f'{where}: wrong source type: {url}')
                    selected.add(url)
                for evidence in para.get('evidence', []):
                    pack = evidence.get('pack_id', 'main')
                    uid = evidence.get('unit_id', '')
                    key = (pack, uid)
                    path = PACKS.get(pack, Path('/nonexistent')) / f'{uid}.json'
                    if not path.is_file():
                        errors.append(f'{where}: missing original unit: {key}')
                        continue
                    if key not in units:
                        units[key] = json.loads(path.read_text())
                    unit = units[key]
                    checked_units.add(key)
                    quote = evidence.get('quote', '')
                    if len(normalized(quote)) < 8:
                        errors.append(f'{where}: excerpt is shorter than 8 characters: {quote}')
                    elif normalized(quote) not in normalized(unit['text']):
                        errors.append(f'{where}: excerpt not found in {pack}/{uid}: {quote[:70]}')
                    allowed_refs = [r for r in original['evidence_refs'] if r.get('pack_id', 'main') == pack and r['unit_id'] == uid]
                    if not allowed_refs:
                        added_evidence.append({'topic_id': tid, 'pack_id': pack, 'unit_id': uid, 'source_url': unit['url']})
                    linked_urls = {unit['url']}
                    for ref in allowed_refs:
                        linked_urls.add(ref['url'])
                        linked_urls.update(ref.get('logical_source_urls', []))
                    if not set(para.get('source_urls', [])) & linked_urls:
                        errors.append(f'{where}: excerpt has no matching cited source')
                    covered_urls.update(set(para.get('source_urls', [])) & linked_urls)
                    evidence['source_url'] = unit['url']
                    evidence['section_or_timestamp'] = next((r['section_or_timestamp'] for r in allowed_refs if r.get('section_or_timestamp')), f"閱讀單位{uid}，原文摘錄定位")
                for url in set(para.get('source_urls', [])) - covered_urls:
                    errors.append(f'{where}: cited URL has no matching original excerpt: {url}')
        if not paragraph_count or not draft.get('official') and not draft.get('interview'):
            errors.append(f'{tid}: no source-backed explanation')
        share_urls = draft.get('share_source_urls', [])
        if not 1 <= len(share_urls) <= 2 or len(share_urls) != len(set(share_urls)):
            errors.append(f'{tid}: share requires one or two unique sources')
        for url in share_urls:
            if url not in selected:
                errors.append(f'{tid}: share source is not used by an explanation: {url}')
            if urlsplit(url).scheme != 'https' or re.search(r'\s', url):
                errors.append(f'{tid}: malformed source URL')
        share_urls = sorted(share_urls, key=lambda u: sources.get(u, {}).get('type') != 'official')
        body = draft.get('share_body', '').strip()
        if not body or 'http://' in body or 'https://' in body:
            errors.append(f'{tid}: empty share body or embedded URL')
        share = body + '\n\n來源：\n' + '\n'.join(readable_url(u) for u in share_urls)
        if utf16(share) > 500:
            errors.append(f'{tid}: share has {utf16(share)} UTF-16 characters')
        if not draft.get('intro') or not isinstance(draft.get('keywords'), list) or len(draft['keywords']) < 3:
            errors.append(f'{tid}: missing intro or search keywords')
        if any(re.fullmatch(r'g\d+', word) for word in draft.get('keywords', [])):
            errors.append(f'{tid}: internal group ID used as a search keyword')
        final = {k: original[k] for k in ['id', 'group_id', 'title', 'question', 'scope']}
        final.update({k: draft.get(k, []) for k in ['intro', 'official', 'interview', 'differences', 'keywords', 'editor_notes']})
        final['group_title'] = groups[original['group_id']]
        final['sources'] = [sources[u] for u in sorted(selected) if u in sources]
        final['sources'].sort(key=lambda s: s['type'] != 'official')
        final['share'] = {'body': body, 'source_urls': share_urls, 'text': share, 'utf16_length': utf16(share)}
        topics.append(final)
    missing = sorted(set(originals) - seen)
    if missing and not args.allow_partial:
        errors.append(f'Missing {len(missing)} topics: {", ".join(missing)}')
    report = {'status': 'failed' if errors else 'partial' if missing else 'passed', 'topics': len(topics), 'expected': 86, 'missing': missing, 'errors': errors}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if errors:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    topics.sort(key=lambda t: (int(t['group_id'][1:]), int(t['id'][1:])))
    data = {'name': '沈伯洋政策分享蒟蒻', 'version': '2026-11-07-v1', 'source_snapshot_date': '2026-11-07', 'generated_at': datetime.now(ZoneInfo('Asia/Taipei')).isoformat(), 'stage': 'expanded_content', 'topic_count': len(topics), 'groups': catalog['groups'], 'notes': ['民間獨立整理，非官方發言。', '依2026-11-07下載快照整理，訪談稿尚未逐句對照影音。', '公開主題頁發布狀態見同資料夾publication.json；社群回應的RAG尚未切換至本資料。'], 'topics': topics}
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    (CONTENT / 'expanded-topics.json').write_text(encoded)
    template = (APP / 'scripts/topic-content-preview.html').read_text()
    (OUT / 'index.html').write_text(template.replace('__TOPIC_DATA__', json.dumps(data, ensure_ascii=False).replace('<', '\\u003c')))
    rag = CONTENT / 'rag'
    rag.mkdir(exist_ok=True)
    rag_lengths = []
    manifest = []
    for topic in topics:
        sections = [f"# {topic['title']}", f"主題編號：{topic['id']}\n類別：{topic['group_title']}\n範圍：{topic['scope']}\n來源快照：2026-11-07", '問題：' + topic['question'], '關鍵詞：' + '、'.join(topic['keywords']), topic['intro']]
        for key, label in [('official', '官方做法'), ('interview', '訪談／活動補充'), ('differences', '來源差異')]:
            if topic[key]:
                sections.append('## ' + label + '\n' + '\n\n'.join(p['text'] for p in topic[key]))
        text = '\n\n'.join(sections) + '\n'
        rag_lengths.append(len(text))
        (rag / f"{topic['id']}.md").write_text(text)
        manifest.append({'key': f"topics/2026-11-07-v1/{topic['id']}.md", 'custom_metadata': {'record_type': 'derived_topic', 'topic_id': topic['id'], 'group_id': topic['group_id'], 'scope': topic['scope'], 'source_date': '2026-11-07'}, 'source_urls': [s['url'] for s in topic['sources']], 'provenance_sidecar': 'expanded-topics.json', 'video_verified': False})
    (CONTENT / 'rag-manifest.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in manifest))
    report.update({'source_coverage': dict(Counter('both' if t['official'] and t['interview'] else 'official_only' if t['official'] else 'interview_only' for t in topics)), 'share_min_utf16': min(t['share']['utf16_length'] for t in topics), 'share_max_utf16': max(t['share']['utf16_length'] for t in topics), 'share_body_chars_mean': round(sum(len(t['share']['body']) for t in topics) / len(topics)), 'original_unit_count_checked': len(checked_units), 'new_topic_evidence_from_existing_corpus': added_evidence, 'paragraph_count': sum(len(t[k]) for t in topics for k in ['official', 'interview', 'differences']), 'rag_chars_min': min(rag_lengths), 'rag_chars_max': max(rag_lengths), 'rag_chars_mean': round(sum(rag_lengths) / len(rag_lengths)), 'content_sha256': hashlib.sha256(encoded.encode()).hexdigest(), 'limitations': ['Excerpt checks establish provenance, not sentence-level semantic correctness.', 'No API-token or end-to-end latency benchmark was performed.', 'RAG Markdown is derived text; use expanded-topics.json as the provenance sidecar before indexing.']})
    (OUT / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
