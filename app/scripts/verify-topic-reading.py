#!/usr/bin/env python3
"""Audit full-reading attestations and their source pointers, without inferring meaning."""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def compact(text):
    return re.sub(r'[\s*`\\]', '', text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('pack', type=Path)
    args = parser.parse_args()
    pack = args.pack
    manifest = read(pack / 'manifest.json')
    units = {unit_id: read(pack / 'units' / f'{unit_id}.json')
             for batch in manifest['batches'] for unit_id in batch['units']}
    errors, warnings, covered, reviewed = [], [], Counter(), []
    topic_count = 0
    for batch in manifest['batches']:
        path = pack / 'reviews' / f'{batch["batch_id"]}.json'
        if not path.exists():
            continue
        try:
            review = read(path)
        except json.JSONDecodeError:
            warnings.append(f'{path.name}: review is currently incomplete or being written')
            continue
        if review.get('batch_id') != batch['batch_id']:
            errors.append(f'{path.name}: wrong batch id')
        actual = [item.get('unit_id') for item in review.get('read_units', [])]
        if set(actual) != set(batch['units']) or len(actual) != len(batch['units']):
            errors.append(f'{path.name}: assigned unit coverage differs')
        for item in review.get('read_units', []):
            unit_id = item.get('unit_id')
            unit = units.get(unit_id)
            if not unit:
                errors.append(f'{path.name}: unknown unit {unit_id}')
                continue
            for key in ['doc_id', 'start', 'end', 'sha256']:
                if item.get(key) != unit[key]:
                    errors.append(f'{path.name}: {unit_id} {key} mismatch')
            sha = hashlib.sha256(unit['text'].encode()).hexdigest()
            if sha != unit['sha256']:
                errors.append(f'{unit_id}: text hash mismatch')
            if item.get('read_fully') is not True:
                errors.append(f'{unit_id}: not attested read_fully')
            covered[unit_id] += 1
        described = {d.get('doc_id') for d in review.get('source_readings', [])}
        if described != set(batch['documents']):
            errors.append(f'{path.name}: document summaries differ from assignment')
        for topic in review.get('topics', []):
            topic_count += 1
            refs = topic.get('source_refs', [])
            if not refs:
                errors.append(f'{path.name}: topic without sources: {topic.get("working_title")}')
            for ref in refs:
                unit = units.get(ref.get('unit_id'))
                if not unit:
                    errors.append(f'{path.name}: unknown referenced unit: {ref.get("unit_id")}')
                    continue
                if unit['unit_id'] not in batch['units'] and not covered[unit['unit_id']]:
                    warnings.append(f'{path.name}: cross-batch reference awaits reading attestation: {unit["unit_id"]}')
                if ref.get('doc_id') != unit['doc_id'] or ref.get('url') != unit['url']:
                    errors.append(f'{path.name}: source identity mismatch for {unit["unit_id"]}')
                excerpt = compact(ref.get('support_excerpt', ''))
                body = compact(unit['previous_context'] + unit['text'])
                if excerpt and excerpt not in body:
                    warnings.append(f'{path.name}: excerpt needs manual check: {topic.get("working_title")} [{unit["unit_id"]}]')
        reviewed.append(batch['batch_id'])
    missing = [key for key in units if not covered[key]]
    extra_topic_notes = 0
    for name in ['root-additions', 'official-additions']:
        extra_path = pack / 'reviews' / f'{name}.json'
        if not extra_path.exists():
            continue
        for topic in read(extra_path).get('topics', []):
            extra_topic_notes += 1
            for ref in topic.get('source_refs', []):
                unit = units.get(ref.get('unit_id'))
                if not unit or unit['doc_id'] != ref.get('doc_id') or unit['url'] != ref.get('url'):
                    errors.append(f'{name}: invalid source identity for {topic.get("working_title")}')
                    continue
                excerpt = compact(ref.get('support_excerpt', ''))
                if not excerpt or excerpt not in compact(unit['previous_context'] + unit['text']):
                    warnings.append(f'{name}: excerpt needs manual check: {topic.get("working_title")} [{unit["unit_id"]}]')
    duplicates = [key for key, count in covered.items() if count > 1]
    if duplicates:
        errors.append(f'Duplicate attestation: {duplicates}')
    result = {'status': 'complete' if not missing and not errors else 'partial' if not errors else 'errors',
              'expected_batches': len(manifest['batches']), 'reviewed_batches': reviewed,
              'expected_units': len(units), 'read_units': len(covered),
              'read_chars': sum(units[key]['chars'] for key in covered),
              'expected_chars': manifest['reading_chars'], 'raw_topics': topic_count,
              'extra_topic_notes': extra_topic_notes,
              'missing_units': missing, 'errors': errors, 'warnings': warnings,
              'scope': 'Reading attestations, range/hash coverage, document summaries and provenance pointers. Not independent policy fact checking or video listening.'}
    (pack / 'reading-coverage.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in {'missing_units', 'warnings'}}, ensure_ascii=False))
    if warnings:
        print(json.dumps({'warnings': warnings}, ensure_ascii=False))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
