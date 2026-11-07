#!/usr/bin/env python3
"""Collect source-backed reading notes; this is not semantic topic consolidation."""
import argparse
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    args = parser.parse_args()
    snapshot = args.snapshot
    main_pack = snapshot / '檢查/全文閱讀工作包'
    packs = [('main', main_pack), ('official-pdf', snapshot / '補充文字/全文閱讀工作包')]
    entries = {e['id']: e for e in read(snapshot / '訪談逐字稿/entries.json')}
    candidates, readings, included = [], [], []

    def add_topics(review, pack_id, batch_id, units):
        for index, topic in enumerate(review.get('topics', []), 1):
            refs = []
            for original in topic.get('source_refs', []):
                ref = dict(original)
                unit = units[ref['unit_id']]
                if unit['doc_id'] != ref['doc_id'] or unit['url'] != ref['url']:
                    raise ValueError(f'Provenance mismatch in {pack_id}:{batch_id}')
                entry_ids = unit.get('entry_ids', [])
                ref.update({'pack_id': pack_id, 'kind': unit['kind'],
                            'entry_ids': entry_ids,
                            'logical_source_urls': [(entries[e].get('article_urls') or entries[e].get('source_urls') or [unit['url']])[0]
                                                    for e in entry_ids if e in entries] or [unit['url']]})
                refs.append(ref)
            candidates.append({**topic, 'candidate_id': f'{pack_id}:{batch_id}:{index:03}',
                               'origin_batch': f'{pack_id}:{batch_id}', 'source_refs': refs})

    for pack_id, pack in packs:
        manifest = read(pack / 'manifest.json')
        unit_ids = [u for b in manifest['batches'] for u in b['units']]
        units = {uid: read(pack / 'units' / f'{uid}.json') for uid in unit_ids}
        for batch in manifest['batches']:
            path = pack / 'reviews' / f'{batch["batch_id"]}.json'
            if not path.exists():
                continue
            try:
                review = read(path)
            except json.JSONDecodeError:
                continue  # Reader may still be writing. Final verification is separate.
            assigned = {u['unit_id'] for u in review.get('read_units', [])}
            if assigned != set(batch['units']):
                continue
            if not all(u.get('read_fully') is True for u in review.get('read_units', [])):
                continue
            included.append(f'{pack_id}:{batch["batch_id"]}')
            readings.extend({**d, 'pack_id': pack_id, 'batch_id': batch['batch_id']} for d in review.get('source_readings', []))
            add_topics(review, pack_id, batch['batch_id'], units)
        if pack_id == 'main':
            for extra_name in ['root-additions', 'official-additions']:
                extra = pack / 'reviews' / f'{extra_name}.json'
                if extra.exists():
                    add_topics(read(extra), pack_id, extra_name, units)

    result = {'status': 'reading_notes_not_final_topics', 'included_batches': included,
              'candidate_count': len(candidates), 'reading_note_count': len(readings),
              'candidates': candidates, 'source_readings': readings,
              'visual_notes': '補充文字/visual-reading.json is a locator only; it is deliberately excluded from publishable claim inputs.'}
    path = main_pack / 'topic-candidates.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    source_map = {}
    for source in readings:
        key = f'{source["pack_id"]}:{source["doc_id"]}'
        item = source_map.setdefault(key, {'title': source['title'], 'url': source['url'],
                                          'summaries': [], 'caveats': []})
        if source['summary'] not in item['summaries']:
            item['summaries'].append(source['summary'])
        for caveat in source.get('caveats', []):
            if caveat not in item['caveats']:
                item['caveats'].append(caveat)
    compact = []
    for topic in candidates:
        compact.append({'id': topic['candidate_id'], 'title': topic['working_title'],
                        'question': topic['question'], 'points': topic['points'],
                        'eligibility': topic['eligibility'], 'caveats': topic.get('caveats', []),
                        'sources': sorted({f'{ref["pack_id"]}:{ref["doc_id"]}' for ref in topic['source_refs']}),
                        'speakers': sorted({ref.get('speaker', '') for ref in topic['source_refs']})})
    compact_path = main_pack / 'consolidation-input.jsonl'
    compact_path.write_text(''.join(json.dumps(item, ensure_ascii=False) + '\n' for item in compact))
    (main_pack / 'consolidation-sources.json').write_text(json.dumps(source_map, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'batches': len(included), 'candidates': len(candidates), 'reading_notes': len(readings),
                      'compact_chars': len(compact_path.read_text())}, ensure_ascii=False))


if __name__ == '__main__':
    main()
