#!/usr/bin/env python3
"""Prepare bounded full-text reading batches, with only provable duplicate removal.

This is research preparation. It does not update the deployed corpus or website.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from collections import defaultdict


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def normalized(text):
    # Whitespace-only normalization. Preserve words, speakers, numbers, symbols.
    return re.sub(r'\s+', '', text)


def visible_markdown(text):
    """Retain every link label; move repetitive URL markup into a link ledger."""
    links = []
    def replace(match):
        links.append({'label': match[2], 'url': match[3], 'image': bool(match[1])})
        return match[2]
    visible = re.sub(r'(!?)\[((?:[^\[\]\n]|\[[^\[\]\n]*\])*)\]\((https?://[^\s)]+)\)', replace, text)
    return visible, links


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--supplements', type=Path)
    parser.add_argument('--batch-chars', type=int, default=65000)
    args = parser.parse_args()
    snapshot = args.snapshot.resolve()
    output = args.output.resolve()
    records = [json.loads(line) for line in (snapshot / '全文資料.jsonl').read_text().splitlines() if line.strip()]
    if args.supplements and args.supplements.exists():
        for line in args.supplements.read_text().splitlines():
            if not line.strip():
                continue
            record = json.loads(line)
            records.append({**record, 'source_group': '官方補充文字', 'entries': [], 'kind': record.get('kind', 'ocr_supplement')})

    documents = []
    groups = defaultdict(list)
    excluded_indexes = []
    for index, record in enumerate(records):
        # Navigation indexes have already been used to verify acquisition coverage.
        # Their resource lists are retained separately; they are not policy prose.
        if record.get('kind') in {'hub_index', 'policy_index'}:
            excluded_indexes.append({'id': record['id'], 'kind': record['kind'], 'url': record.get('source_url'), 'reason': 'navigation_index', 'text_sha256': digest(record.get('text', ''))})
            continue
        text = record.get('text', '')
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f'Empty readable source: {record.get("id", index)}')
        entry_ids = sorted(e['entry_id'] for e in record.get('entries', []) if e.get('entry_id'))
        group = '|'.join(entry_ids) if entry_ids else record.get('related_policy_url') or record.get('source_url') or record.get('id')
        visible, links = visible_markdown(text)
        warnings = list(record.get('source_warnings', record.get('warnings', [])))
        speaker_note = re.search(r'^speaker_attribution:\s*(.+)$', text, re.MULTILINE)
        if speaker_note:
            warnings.append('原稿講者標示：' + speaker_note[1].strip())
        doc = {
            'doc_id': f'd{len(documents) + 1:04}',
            'resource_id': record.get('id', f'supplement-{index}'),
            'entry_ids': entry_ids,
            'title': record.get('title', ''),
            'url': record.get('source_url', ''),
            'kind': record.get('kind'),
            'source_group': record.get('source_group'),
            'text_path': record.get('text_path'),
            'retrieved_at': record.get('retrieved_at'),
            'source_warnings': warnings,
            'notes': record.get('notes'),
            'text_sha256': digest(text),
            'original_chars': len(text),
            'visible_chars': len(visible),
            'links': links,
            'text': visible,
        }
        documents.append(doc)
        groups[str(group)].append(doc)

    duplicate_paragraphs = []
    for group, docs in groups.items():
        # Longest version is read first. A shorter version is reduced only where
        # its paragraph is literally present in an already scheduled document.
        seen = []
        for doc in sorted(docs, key=lambda d: -d['visible_chars']):
            paragraphs = re.split(r'\n\s*\n', doc['text'])
            kept = []
            for paragraph in paragraphs:
                norm = normalized(paragraph)
                duplicate = next((prior for prior, body in seen if len(norm) >= 30 and norm in body), None)
                if duplicate:
                    duplicate_paragraphs.append({'doc_id': doc['doc_id'], 'covered_by': duplicate, 'chars': len(paragraph), 'paragraph_sha256': digest(paragraph), 'reason': 'verbatim_paragraph_in_same_logical_source'})
                else:
                    kept.append(paragraph)
            doc['reading_text'] = '\n\n'.join(kept)
            doc['reading_chars'] = len(doc['reading_text'])
            seen.append((doc['doc_id'], normalized(doc['text'])))

    units = []
    for doc in documents:
        text = doc['reading_text']
        position = 0
        doc_units = []
        while position < len(text):
            end = min(position + 6000, len(text))
            if end < len(text):
                newline = text.rfind('\n', position + 4000, end)
                if newline > position:
                    end = newline + 1
            unit_id = f'u{len(units) + 1:04}'
            body = text[position:end]
            unit = {
                'unit_id': unit_id, 'doc_id': doc['doc_id'],
                'start': position, 'end': end, 'chars': len(body), 'sha256': digest(body),
                'title': doc['title'], 'url': doc['url'], 'kind': doc['kind'],
                'entry_ids': doc['entry_ids'], 'warnings': doc['source_warnings'],
                'previous_context': text[max(0, position - 400):position],
                'text': body,
            }
            units.append(unit)
            doc_units.append(unit_id)
            position = end
        doc['units'] = doc_units
        assert sum(u['chars'] for u in units if u['doc_id'] == doc['doc_id']) == len(text)

    (output / 'units').mkdir(parents=True, exist_ok=True)
    for unit in units:
        save(output / 'units' / f'{unit["unit_id"]}.json', unit)
    batches = []
    for unit in units:
        if not batches or batches[-1]['chars'] + unit['chars'] > args.batch_chars:
            batches.append({'batch_id': f'b{len(batches) + 1:02}', 'chars': 0, 'units': [], 'documents': []})
        batch = batches[-1]
        batch['units'].append(unit['unit_id'])
        batch['chars'] += unit['chars']
        if unit['doc_id'] not in batch['documents']:
            batch['documents'].append(unit['doc_id'])
    for batch in batches:
        save(output / 'batches' / f'{batch["batch_id"]}.json', batch)
    clean_documents = [{key: value for key, value in doc.items() if key not in {'text', 'reading_text'}} for doc in documents]
    save(output / 'documents.json', clean_documents)
    save(output / 'duplicate-paragraphs.json', duplicate_paragraphs)
    save(output / 'index-pages.json', excluded_indexes)
    manifest = {
        'snapshot': str(snapshot), 'raw_readable_records': len(records),
        'documents': len(documents), 'original_chars': sum(d['original_chars'] for d in documents),
        'visible_chars': sum(d['visible_chars'] for d in documents),
        'markup_handling': 'All Markdown link labels retained; target URLs recorded per document. Timestamp URLs need not be reread as prose.',
        'reading_chars': sum(u['chars'] for u in units), 'reading_units': len(units),
        'batches': batches, 'removed_verbatim_paragraphs': len(duplicate_paragraphs),
        'navigation_indexes_separately_accounted': excluded_indexes,
        'status': 'prepared_not_yet_read',
    }
    save(output / 'manifest.json', manifest)
    print(json.dumps({key: manifest[key] for key in ['raw_readable_records','documents','original_chars','reading_chars','reading_units','removed_verbatim_paragraphs']}, ensure_ascii=False))
    print(json.dumps([{'batch_id': b['batch_id'], 'chars': b['chars'], 'units': len(b['units'])} for b in batches]))


if __name__ == '__main__':
    main()
