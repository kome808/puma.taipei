#!/usr/bin/env python3
"""Check revised share text and the original excerpts supplied for added details.

This establishes provenance and length, not semantic correctness; editorial
review remains necessary before applying the proposals.
"""
import importlib.util
import json
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
REVISION = APP / 'content/policy-topics/revisions/2026-11-07-share-expansion'
spec = importlib.util.spec_from_file_location('topic_builder', APP / 'scripts/build-expanded-topics.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def main():
    errors, rows, seen, details, lengths, growth = [], [], set(), 0, [], []
    catalog = json.loads((builder.BASE / 'topic-catalog.json').read_text())
    topics = {t['id']: t for t in catalog['topics']}
    for batch in 'abc':
        original = {r['id']: r for r in json.loads((REVISION / f'before-batch-{batch}.json').read_text())}
        path = REVISION / f'proposed-{batch}.json'
        if not path.is_file():
            errors.append(f'Missing {path.name}')
            continue
        proposed = json.loads(path.read_text())
        if {r.get('id') for r in proposed} != set(original):
            errors.append(f'{batch}: topic IDs differ from original batch')
        for row in proposed:
            tid = row.get('id')
            if tid not in original or tid in seen:
                errors.append(f'{tid}: unknown or duplicated ID')
                continue
            seen.add(tid)
            before = original[tid]
            urls = row.get('share_source_urls', [])
            if urls != before['share_source_urls']:
                errors.append(f'{tid}: changed source selection or order')
            body = row.get('share_body', '').strip()
            if not body or 'https://' in body or 'http://' in body:
                errors.append(f'{tid}: empty body or embedded URL')
            full = body + '\n\n來源：\n' + '\n'.join(builder.readable_url(u) for u in urls)
            length = builder.utf16(full)
            if length > 500:
                errors.append(f'{tid}: {length} UTF-16 characters')
            additions = row.get('added_details', [])
            for n, addition in enumerate(additions):
                where = f'{tid}/added_details/{n + 1}'
                pack, uid = addition.get('pack_id', 'main'), addition.get('unit_id', '')
                directory = builder.PACKS.get(pack)
                path = directory / f'{uid}.json' if directory else Path('/nonexistent')
                if not path.is_file():
                    errors.append(f'{where}: missing original unit {pack}/{uid}')
                    continue
                unit = json.loads(path.read_text())
                quote = builder.normalized(addition.get('quote', ''))
                if len(quote) < 8 or quote not in builder.normalized(unit['text']):
                    errors.append(f'{where}: excerpt not found in {pack}/{uid}')
                if addition.get('source_url') not in urls:
                    errors.append(f'{where}: detail uses a source outside the share')
                linked_urls = {unit['url']}
                for ref in topics[tid]['evidence_refs']:
                    if ref.get('pack_id', 'main') == pack and ref['unit_id'] == uid:
                        linked_urls.add(ref['url'])
                        linked_urls.update(ref.get('logical_source_urls', []))
                if addition.get('source_url') not in linked_urls:
                    errors.append(f'{where}: unit URL differs from cited URL')
                if not addition.get('text', '').strip():
                    errors.append(f'{where}: missing description of added detail')
                details += 1
            lengths.append(length)
            delta = builder.utf16(body) - builder.utf16(before['share_body'])
            growth.append(delta)
            rows.append({'id': tid, 'full_utf16_length': length, 'body_growth': delta, 'added_details': len(additions), 'changed': body != before['share_body']})
    report = {
        'status': 'failed' if errors else 'passed', 'topics': len(seen),
        'errors': errors, 'added_details_checked': details,
        'changed_topics': sum(r['changed'] for r in rows),
        'longer_topics': sum(n > 0 for n in growth),
        'share_min_utf16': min(lengths, default=0),
        'share_max_utf16': max(lengths, default=0),
        'share_mean_utf16': round(sum(lengths) / len(lengths)) if lengths else 0,
        'topics_at_least_300': sum(n >= 300 for n in lengths),
        'rows': sorted(rows, key=lambda r: r['id']),
        'limitations': ['Exact excerpts and source matches do not establish semantic correctness.', 'Original transcripts have not been checked word for word against recordings.'],
    }
    (REVISION / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'rows'}, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
