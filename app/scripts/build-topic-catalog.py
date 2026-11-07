#!/usr/bin/env python3
"""Resolve a reviewed semantic mapping into a topic dataset with real source URLs."""
import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def unique(items):
    return list(dict.fromkeys(items))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('--mapping', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--markdown', type=Path)
    args = parser.parse_args()
    root = args.snapshot
    pack = root / '檢查/全文閱讀工作包'
    coverage = read(pack / 'reading-coverage.json')
    pdf_coverage = read(root / '補充文字/全文閱讀工作包/reading-coverage.json')
    visual_coverage = read(root / '補充文字/visual-coverage.json')
    snapshot_dates = {group: read(root / group / 'coverage.json')['snapshot_date']
                      for group in ['官方政策', '訪談逐字稿']}
    if coverage['status'] != 'complete' or coverage['errors'] or coverage['warnings']:
        raise ValueError('Main full-reading and excerpt checks must be complete without unresolved warnings')
    if pdf_coverage['status'] != 'complete' or pdf_coverage['errors'] or pdf_coverage['warnings']:
        raise ValueError('PDF reading checks must be complete')
    if visual_coverage['unread_pages'] or visual_coverage['sha_errors']:
        raise ValueError('Visual inspection coverage is incomplete')
    notes = read(pack / 'topic-candidates.json')
    candidates = {c['candidate_id']: c for c in notes['candidates']}
    mapping = read(args.mapping)
    groups = {g['id']: g for g in mapping['groups']}
    if len(groups) != len(mapping['groups']):
        raise ValueError('Duplicate group id')
    used, topic_ids, topics = Counter(), set(), []
    source_metadata = read(pack / 'consolidation-sources.json')
    official_kinds = {'policy_detail', 'policy_attachment_text', 'framework_page', 'heart_axis'}
    for topic in mapping['topics']:
        if topic.get('scope') not in {'municipal_policy', 'public_issue'}:
            raise ValueError(f'Invalid topic scope: {topic.get("id")}')
        if not all(isinstance(topic.get(key), str) and topic[key].strip()
                   for key in ['title', 'question', 'summary']):
            raise ValueError(f'Missing topic prose: {topic.get("id")}')
        if topic['id'] in topic_ids or topic['group_id'] not in groups:
            raise ValueError(f'Invalid topic/group identity: {topic["id"]}')
        topic_ids.add(topic['id'])
        members = topic['members']
        if not members:
            raise ValueError(f'Topic without evidence: {topic["id"]}')
        refs, source_warnings = [], []
        for member in members:
            if member not in candidates:
                raise ValueError(f'Unknown candidate: {member}')
            used[member] += 1
            candidate = candidates[member]
            refs.extend(candidate['source_refs'])
            source_warnings.extend(candidate.get('caveats', []))
            for ref in candidate['source_refs']:
                source_warnings.extend(source_metadata.get(f'{ref["pack_id"]}:{ref["doc_id"]}', {}).get('caveats', []))
        refs_unique, seen = [], set()
        for ref in refs:
            key = (ref['pack_id'], ref['doc_id'], ref['unit_id'], ref.get('section_or_timestamp'))
            if key not in seen:
                refs_unique.append(ref)
                seen.add(key)
        source_options = {}
        for ref in refs_unique:
            logical = (ref.get('logical_source_urls') or [ref['url']])[0]
            metadata = source_metadata.get(f'{ref["pack_id"]}:{ref["doc_id"]}', {})
            is_official = ref['kind'] in official_kinds
            # Distinct original policy pages/PDFs stay separate. Different text
            # versions of one interview stay one logical source.
            key = ('official' if is_official else 'interview', logical)
            url = ref['url']
            score = 4 if '/transcript/' in url else 3 if url.endswith('/') else 2 if url.endswith('.pdf') else 1
            if url.endswith('.json'):
                score = 0
            option = {'title': metadata.get('title', logical), 'url': url,
                      'logical_url': logical, 'type': key[0], 'kind': ref['kind']}
            if key not in source_options or score > source_options[key][0]:
                source_options[key] = (score, option)
        sources = [item[1] for item in source_options.values()]
        sources.sort(key=lambda s: (s['type'] != 'official', s['title'], s['url']))
        topics.append({**topic, 'sources': sources, 'evidence_refs': refs_unique,
                       'source_cautions': unique(source_warnings)})
    exclusions = mapping.get('excluded_candidates', [])
    excluded_ids = set()
    for item in exclusions:
        key = item['id']
        if key not in candidates or not item.get('reason'):
            raise ValueError(f'Invalid exclusion: {key}')
        excluded_ids.add(key)
    if len(excluded_ids) != len(exclusions):
        raise ValueError('Duplicate excluded candidate id')
    missing = set(candidates) - set(used) - excluded_ids
    if missing:
        raise ValueError(f'Unaccounted reading candidates: {sorted(missing)}')
    overlapping = excluded_ids & set(used)
    if overlapping:
        raise ValueError(f'Candidates both used and excluded: {sorted(overlapping)}')
    if not topics:
        raise ValueError('Empty topic catalog')
    catalog = {
        'stage': 'source_backed_topics_not_share_posts_not_deployed',
        'generated_at': datetime.now(ZoneInfo('Asia/Taipei')).isoformat(timespec='seconds'),
        'snapshot_path': str(root.resolve()),
        'source_snapshot_date': max(snapshot_dates.values()),
        'source_snapshot_dates': snapshot_dates,
        'reading_scope': {'main_units': coverage['read_units'], 'main_chars': coverage['read_chars'],
                          'pdf_units': pdf_coverage['read_units'], 'pdf_chars': pdf_coverage['read_chars'],
                          'visual_pages': visual_coverage['viewed_unique_pages'],
                          'video_verified': False, 'visual_verbatim_verified': False},
        'group_count': len(groups), 'topic_count': len(topics),
        'by_scope': dict(Counter(t['scope'] for t in topics)),
        'accounted_candidates': len(set(used) | excluded_ids),
        'raw_candidates': len(candidates), 'groups': list(groups.values()),
        'topics': topics, 'excluded_candidates': exclusions,
        'quality_notes': mapping.get('quality_notes', []),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    if args.markdown:
        lines = ['# 政策與訪談主題總表', '',
                 f'來源快照：{catalog["source_snapshot_date"]}。{len(topics)} 個主題；依完整閱讀後的內容歸納。', '',
                 '本表整理來源提出的政策與觀點。逐字稿未逐句聽校，圖面閱讀不是逐字校訂；這份表尚非500字元分享稿。', '']
        for group in groups.values():
            lines.extend([f'## {group["title"]}', ''])
            for topic in topics:
                if topic['group_id'] != group['id']:
                    continue
                lines.extend([f'### {topic["title"]}', '', topic['question'], '', topic['summary'], ''])
                for source in topic['sources']:
                    label = '官方政策／附件' if source['type'] == 'official' else '訪談／活動整理'
                    lines.append(f'- {label}：[{source["title"]}]({source["url"]})')
                lines.append('')
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text('\n'.join(lines) + '\n')
    print(json.dumps({key: catalog[key] for key in ['group_count', 'topic_count', 'by_scope', 'accounted_candidates', 'raw_candidates']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
