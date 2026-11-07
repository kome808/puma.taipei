#!/usr/bin/env python3
"""Export existing source material and topic research as local Markdown.

No model calls, social-post fields, website assets, indexing or deployment.
"""
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from zoneinfo import ZoneInfo

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
CONTENT = APP / 'content/policy-topics'
SNAPSHOT = ROOT / '00_來源資料/2026-11-06_更新版01'
PACKS = {
    'main': SNAPSHOT / '檢查/全文閱讀工作包',
    'official-pdf': SNAPSHOT / '補充文字/全文閱讀工作包',
}
OUT = CONTENT / 'markdown/2026-11-07_研究整理'
SCOPE = {'municipal_policy': '市政政策構想', 'public_issue': '公共議題觀點'}
KIND = {
    'policy_detail': '官方政策詳細頁', 'policy_axis': '官方政策主軸',
    'policy_framework': '官方政策框架', 'policy_index': '官方政策索引',
    'policy_attachment_text': '官方附件文字層', 'interview_article': '訪談／活動整理文章',
    'transcript_page': '逐字稿頁', 'transcript_attachment': '逐字稿附件',
    'framework_page': '官方政策框架頁', 'heart_axis': '官方HEART主軸',
    'article_attachment': '整理文章附件', 'source_notes_attachment': '來源紀錄附件',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def characters(text):
    return len(text.encode('utf-16-le')) // 2


def research_body(topic):
    return '\n\n'.join([topic['intro']] + [p['text'] for section in ['official', 'interview', 'differences'] for p in topic[section]])


def clean_label(text):
    return str(text).replace('|', '｜').replace('[', '［').replace(']', '］').replace('\n', ' ')


def safe_filename(text):
    return re.sub(r'[\\/:*?"<>|]', '＿', text).strip().rstrip('.')


def local_link(label, target, page):
    import os
    return f'[{clean_label(label)}]({quote(os.path.relpath(target, page.parent), safe="/")})'


def remote_link(label, url):
    if urlsplit(url).scheme != 'https' or re.search(r'\s', url):
        raise ValueError(f'Invalid source URL: {url}')
    return f'[{clean_label(label)}]({url})'


def main():
    source_path = CONTENT / 'expanded-topics.json'
    original_json = source_path.read_bytes()
    data = json.loads(original_json)
    topics = data['topics']
    groups = data['groups']
    now = datetime.now(ZoneInfo('Asia/Taipei')).isoformat(timespec='seconds')
    date = now[:10]
    if len(topics) != 86 or len({t['id'] for t in topics}) != 86 or len(groups) != 15:
        raise ValueError('Expected the existing 15-group, 86-topic research library')
    documents, units, by_url, checks, output_files = {}, {}, defaultdict(list), [], []
    OUT.mkdir(parents=True, exist_ok=True)

    def write(path, text):
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = text.encode('utf-8')
        path.write_bytes(payload)
        output_files.append({'path': str(path.relative_to(OUT)), 'sha256': sha(payload), 'bytes': len(payload)})

    # Retain each downloaded textual document, including same-event variants.
    # Original Markdown is copied byte-for-byte; PDF text is labelled separately.
    for pack, directory in PACKS.items():
        pack_units = {}
        for path in sorted((directory / 'units').glob('*.json')):
            unit = json.loads(path.read_text())
            units[(pack, unit['unit_id'])] = unit
            pack_units[unit['unit_id']] = unit
        for doc in json.loads((directory / 'documents.json').read_text()):
            target = OUT / '來源文字' / pack / f'{doc["doc_id"]}.md'
            if pack == 'main':
                original = SNAPSHOT / doc['text_path']
                payload = original.read_bytes()
                text = payload.decode('utf-8')
                checks.append({'source_path': str(original.relative_to(ROOT)), 'sha256': sha(payload), 'copy_path': str(target.relative_to(OUT)), 'exact_copy': True})
            else:
                ordered = [pack_units[uid] for uid in doc['units']]
                content = '\n\n'.join(unit['text'] for unit in ordered)
                text = f'# {doc["title"]}\n\n來源：{remote_link(doc["title"], doc["url"])}\n\n來源快照：{data["source_snapshot_date"]}\n\n以下為已保存PDF的文字層抽取結果；頁碼標記沿用抽取資料，圖面內容請回看原PDF。\n\n---\n\n{content}\n'
            write(target, text)
            documents[(pack, doc['doc_id'])] = {**doc, 'pack_id': pack, 'file': target}
            by_url[doc['url']].append(documents[(pack, doc['doc_id'])])

    topic_files = {
        t['id']: OUT / '主題' / f'{t["group_id"]}_{safe_filename(t["group_title"])}' / f'{t["id"]}_{safe_filename(t["title"])}.md'
        for t in topics
    }
    coverage = Counter('both' if t['official'] and t['interview'] else 'official_only' if t['official'] else 'interview_only' for t in topics)
    paragraph_count, evidence_count, used_sources = 0, 0, set()
    for topic in topics:
        for key in ['official', 'interview', 'differences']:
            for paragraph in topic[key]:
                paragraph_count += 1
                used_sources.update(paragraph['source_urls'])
                for evidence in paragraph['evidence']:
                    unit = units[(evidence.get('pack_id', 'main'), evidence['unit_id'])]
                    compact = lambda value: re.sub(r'\s+', '', value)
                    excerpt = compact(evidence['quote'])
                    if len(excerpt) < 8 or excerpt not in compact(unit['text']):
                        raise ValueError(f'Unmatched evidence in {topic["id"]}/{evidence["unit_id"]}')
                    evidence_count += 1

    def topic_markdown(topic, page, level=1, include_navigation=True):
        h = '#' * level
        name = {s['url']: s['title'] for s in topic['sources']}
        lines = [f'{h} {topic["id"]}｜{topic["title"]}', '',
                 f'分類：{topic["group_title"]}  ', f'範圍：{SCOPE[topic["scope"]]}  ',
                 f'來源快照日期：{data["source_snapshot_date"]}  ', f'整理日期：{date}  ',
                 f'研究正文：{characters(research_body(topic))}字元（不含標題、來源連結及校讀備註）', '',
                 f'對應問題：{topic["question"]}', '',
                 '關鍵詞：' + '、'.join(topic['keywords']), '', f'{h}# 主題說明', '', topic['intro'], '']
        for key, label, empty in [
            ('official', '官方政策的做法', '本題目前整理引用的是訪談／活動資料，未在本題列入官方政策段落。'),
            ('interview', '訪談／活動補充', '本題目前整理引用的是官方政策或官方附件，未在本題列入訪談段落。'),
            ('differences', '來源說法的差異', '本題目前沒有記錄需要並列的來源差異；不表示已排除所有差異。'),
        ]:
            if key == 'differences' and not topic[key]:
                continue
            lines += [f'{h}# {label}', '']
            if not topic[key]:
                lines += [empty, '']
            for paragraph in topic[key]:
                lines += [paragraph['text'], '', '資料來源：' + '、'.join(remote_link(name[url], url) for url in paragraph['source_urls']), '']
                locations = []
                for evidence in paragraph['evidence']:
                    pack = evidence.get('pack_id', 'main')
                    unit = units[(pack, evidence['unit_id'])]
                    saved = documents[(pack, unit['doc_id'])]
                    position = evidence.get('section_or_timestamp', '')
                    if not position or position.startswith('閱讀單位'):
                        position = '原文內定位'
                    location = local_link(f'{saved["title"]}｜{position}', saved['file'], page)
                    if location not in locations:
                        locations.append(location)
                lines += ['保存文字：' + '、'.join(locations), '']
        if topic['editor_notes']:
            lines += [f'{h}# 校讀備註（內部）', ''] + [f'- {note}' for note in topic['editor_notes']] + ['']
        lines += [f'{h}# 本題來源一覽', '']
        for kind, label in [('official', '官方政策／附件'), ('interview', '訪談／活動')]:
            selected = [s for s in topic['sources'] if s['type'] == kind]
            if selected:
                lines += [f'{h}## {label}', '']
                for source in selected:
                    lines.append('- ' + remote_link(source['title'], source['url']))
                lines.append('')
        if include_navigation:
            lines += [local_link('回分類與主題索引', OUT / 'README.md', page) + ' · ' + local_link('查看來源索引', OUT / '來源索引.md', page), '']
        return '\n'.join(lines)

    for topic in topics:
        page = topic_files[topic['id']]
        metadata = '\n'.join(f'{key}: {json.dumps(value, ensure_ascii=False)}' for key, value in {
            'topic_id': topic['id'], 'title': topic['title'], 'group_id': topic['group_id'],
            'scope': topic['scope'], 'source_snapshot_date': data['source_snapshot_date'],
            'prepared_date': date, 'document_type': 'internal_research', 'publication_status': 'not_published',
            'research_body_characters': characters(research_body(topic)),
        }.items())
        write(page, '---\n' + metadata + '\n---\n\n' + topic_markdown(topic, page))

    index = OUT / 'README.md'
    lines = ['# 沈伯洋政策與訪談研究整理', '',
             f'整理日期：{date}  ', f'來源快照：{data["source_snapshot_date"]}  ', '狀態：本機研究文件，這批文件未發布到網站。', '',
             '本資料包依既有下載文字與已校讀的主題內容彙整，供研究、查核與後續人工編輯。原始快照、網站程式及既有檢索文件維持原狀。', '',
             '共15類、86題，其中81題為市政政策構想、5題為公共議題觀點。每題分列官方做法、訪談補充、來源差異及原文連結；沒有某類引用時，僅說明本題整理範圍，不推論來源從未談過。', '',
             f'來源組成：官方與訪談都有{coverage["both"]}題、只引用官方{coverage["official_only"]}題、只引用訪談{coverage["interview_only"]}題。', '',
             f'另附{len(documents)}份來源文字：218份既有Markdown原樣保存、5份官方PDF文字層轉為Markdown。同一場訪談的文章、逐字稿與附件仍各自保留，不代表有{len(documents)}場獨立訪談。', '',
             '本包涵蓋已建立閱讀工作包的文字資料；圖片、影音及未取得可讀文字的附件保留在原始下載快照，不列入這批Markdown。', '',
             '這批研究文件不匯出社群分享稿，不執行模型API、網站部署或搜尋索引更新。後續發布方式另行處理。', '',
             '## 閱讀入口', '',
             '- ' + local_link('86題完整合訂本', OUT / '政策與訪談_完整整理.md', index),
             '- ' + local_link('來源索引與保存文字', OUT / '來源索引.md', index),
             '- ' + local_link('版本與校讀說明', OUT / '版本與校讀說明.md', index),
             '- ' + local_link('各題字數與計算方式', OUT / '摘要與字數說明.md', index), '',
             '## 摘要與研究文件的篇幅', '',
             '500字元是短摘要連同來源網址、標點與換行的上限，不是每份研究文件的固定長度。這份研究版按主題分列官方、訪談及差異，未收錄既有短摘要正文；每題已標示研究正文的字元數。', '',
             '## 分類與主題', '']
    for group in groups:
        selected = [t for t in topics if t['group_id'] == group['id']]
        lines += [f'### {group["title"]}（{len(selected)}題）', '']
        for topic in selected:
            label = '官方＋訪談' if topic['official'] and topic['interview'] else '官方' if topic['official'] else '訪談／活動'
            lines.append('- ' + local_link(f'{topic["id"]}｜{topic["title"]}', topic_files[topic['id']], index) + f'〔{label}〕')
        lines.append('')
    write(index, '\n'.join(lines))

    combined = OUT / '政策與訪談_完整整理.md'
    lines = ['# 沈伯洋政策與訪談：86題完整研究整理', '',
             f'來源快照：{data["source_snapshot_date"]}；整理日期：{date}。內部研究文件，非官方發言。', '',
             local_link('分類索引', index, combined) + ' · ' + local_link('版本與校讀說明', OUT / '版本與校讀說明.md', combined), '']
    for topic in topics:
        lines += ['---', '', topic_markdown(topic, combined, level=2, include_navigation=False), '']
    write(combined, '\n'.join(lines))

    source_index = OUT / '來源索引.md'
    lines = ['# 來源索引', '', '先列本次主題引用的原文，再列全部保存文字。來源網站、資料類型與原始擷取時間沿用下載記錄；未重新抓取網站。', '',
             '## 本次主題引用的原文', '', '| 來源 | 類型 | 對應主題 |', '| --- | --- | --- |']
    sources = {s['url']: s for t in topics for s in t['sources']}
    for url, source in sorted(sources.items(), key=lambda item: (item[1]['type'] != 'official', item[1]['title'])):
        related = [t for t in topics if any(s['url'] == url for s in t['sources'])]
        refs = '、'.join(local_link(t['id'], topic_files[t['id']], source_index) for t in related)
        lines.append(f'| {remote_link(source["title"], url)} | {"官方" if source["type"] == "official" else "訪談／活動"} | {refs} |')
    lines += ['', '## 全部保存文字', '', '以下保留同源不同版本，供回查；不把逐字稿、整理文及附件合併成同一份原文。', '',
              '| 編號 | 保存文字 | 來源網站 | 類型 | 原始擷取時間（UTC） |', '| --- | --- | --- | --- | --- |']
    for (pack, doc_id), doc in documents.items():
        lines.append(f'| {pack}/{doc_id} | {local_link(doc["title"], doc["file"], source_index)} | {remote_link("原文", doc["url"])} | {clean_label(KIND.get(doc["kind"], doc["kind"]))} | {doc.get("retrieved_at") or "未逐檔記錄，沿用來源快照"} |')
    write(source_index, '\n'.join(lines) + '\n')

    length_page = OUT / '摘要與字數說明.md'
    research_counts = [characters(research_body(t)) for t in topics]
    summary_counts = [characters(t['share']['body']) for t in topics]
    full_counts = [characters(t['share']['text']) for t in topics]
    mean = lambda values: round(sum(values) / len(values))
    lines = ['# 摘要與字數說明', '',
             '這份Markdown是研究資料整理，不是每題固定500字的摘要合集。研究正文、既有短摘要和文件全部文字的長度，必須分開計算。', '',
             '500字元是短摘要連同來源網址、標點和換行的上限，並非每題都必須補滿的目標；也不是模型token數。一般中文字各算1字元，特殊字元以UTF-16保守計算。', '',
             '| 內容 | 最短 | 最長 | 平均 |', '| --- | ---: | ---: | ---: |',
             f'| 本包研究正文 | {min(research_counts)} | {max(research_counts)} | {mean(research_counts)} |',
             f'| 既有短摘要正文（未匯入本包正文） | {min(summary_counts)} | {max(summary_counts)} | {mean(summary_counts)} |',
             f'| 既有短摘要連同來源 | {min(full_counts)} | {max(full_counts)} | {mean(full_counts)} |', '',
             '研究正文只計主題說明、官方、訪談及差異段落，段落之間以兩個換行計入。不含標題、索引、關鍵詞、來源連結、校讀備註及這份字數說明。', '',
             '下表只列既有摘要欄位的長度，不把舊摘要重新包裝成研究正文。尚未為了接近500字元新增內容；如要補充，須依原始資料的實質細節處理。', '',
             '## 逐題字數', '', '| 主題 | 研究正文 | 短摘要正文 | 短摘要含來源／上限500 |', '| --- | ---: | ---: | ---: |']
    for topic in topics:
        lines.append(f'| {local_link(topic["id"] + "｜" + topic["title"], topic_files[topic["id"]], length_page)} | {characters(research_body(topic))} | {characters(topic["share"]["body"])} | {characters(topic["share"]["text"])} |')
    lines += ['', local_link('回研究索引', index, length_page), '']
    write(length_page, '\n'.join(lines))

    notes = OUT / '版本與校讀說明.md'
    lines = ['# 版本與校讀說明', '', f'- 文件整理時間：{now}', f'- 來源快照日期：{data["source_snapshot_date"]}',
             '- 原下載資料夾：`00_來源資料/2026-11-06_更新版01/`。資料夾名與實際台灣擷取日期不同，勿將檔名當成另一批新來源。',
             '- 主題內容依既有 `expanded-topics.json` 的主題說明、官方、訪談及差異欄位匯出，未把社群分享稿轉作研究正文。',
             '- 本包為內部研究整理，未發布、未更新線上RAG，也未停用或修改既有公開網站/API。後續網站發布須另行確認內容及用途。', '',
             '## 證據與限制', '',
             '- 每段保留實際引用的來源連結與保存文字入口。官方政策／附件先列，訪談／活動後列。',
             '- 原文摘錄已以既有證據資料比對保存文字單位；本次僅轉換文件格式，未重新逐句聽校影音。',
             '- 訪談稿可能混合逐字對話與整理紀要，原來源的警語及未核對標示留在保存文字。',
             '- 官方PDF另存文字層；文字抽取不等於完整保存全部圖面資訊，請配合原PDF查閱。',
             '- 內容是來源中的主張與政策構想，不代表服務已實施、數字已獨立核實或效果已獲驗證。',
             '- 「未列入本題引用」只描述這份主題整理的覆蓋範圍；不據此判定官方或訪談從未提及。',
             '- 網站、模型或資料庫狀態未在本次做遠端驗證，不以本地文件驗證代替線上驗收。', '',
             '## 文件結構', '',
             '- `README.md`：15類、86題索引。', '- `政策與訪談_完整整理.md`：同一批86題的完整合訂本。',
             '- `主題/`：每題一份Markdown，附內部校讀備註。', '- `來源索引.md`：本次引用原文與223份保存文字入口。',
             '- `來源文字/main/`：218份既有Markdown逐位元組複製。', '- `來源文字/official-pdf/`：5份官方PDF文字層Markdown。',
             '- `摘要與字數說明.md`：分開計算研究正文、既有短摘要正文及含來源的字元數。',
             '- `manifest.json`：輸入及輸出檔案雜湊，供版本比對。', '- `validation.json`：題數、證據摘錄及本包導覽連結檢查。', '',
             '## 重建', '', '在專案根目錄執行：', '', '```sh', 'python3 app/scripts/export-research-markdown.py', '```', '',
             '工具只讀取既有資料，寫入這份研究文件資料包；不呼叫模型、不改寫原始快照、不修改網站資產、不部署。', '']
    write(notes, '\n'.join(lines))

    # Verify authored navigation, copied source hashes and all topic identifiers.
    errors, links_checked = [], 0
    authored = [index, source_index, combined, notes, length_page, *topic_files.values()]
    for page in authored:
        for target in re.findall(r'\]\(([^)]+)\)', page.read_text()):
            if urlsplit(target).scheme or target.startswith('#'):
                continue
            resolved = (page.parent / unquote(target.split('#')[0])).resolve()
            if not resolved.is_file():
                errors.append(f'{page.relative_to(OUT)}: missing {target}')
            links_checked += 1
    for row in checks:
        if sha((ROOT / row['source_path']).read_bytes()) != row['sha256'] or sha((OUT / row['copy_path']).read_bytes()) != row['sha256']:
            errors.append(f'Original/copy changed: {row["source_path"]}')
    for page in topic_files.values():
        text = page.read_text()
        if '## 官方政策的做法' not in text or '## 訪談／活動補充' not in text:
            errors.append(f'Missing research section in {page.name}')
    if sha(source_path.read_bytes()) != sha(original_json):
        errors.append('Input content changed during export')
    report = {'status': 'failed' if errors else 'passed', 'groups': len(groups), 'topics': len(topics),
              'scope_counts': dict(Counter(t['scope'] for t in topics)), 'source_coverage': dict(coverage),
              'paragraphs': paragraph_count, 'evidence_excerpts_checked': evidence_count,
              'source_documents': len(documents), 'original_markdown_exact_copies': len(checks),
              'official_pdf_text_documents': len(documents) - len(checks), 'unique_cited_urls': len(sources),
              'authored_local_links_checked': links_checked, 'model_api_calls': 0,
              'social_share_fields_exported': False, 'website_deployed': False, 'errors': errors}
    (OUT / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    manifest = {'type': 'internal_research_markdown', 'generated_at': now,
                'source_snapshot_date': data['source_snapshot_date'], 'publication_status': 'not_published',
                'input': {'path': str(source_path.relative_to(ROOT)), 'sha256': sha(original_json)},
                'files': output_files, 'exact_source_copies': checks}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
