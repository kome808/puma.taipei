#!/usr/bin/env python3
"""Build an offline source catalog and verify downloaded files; no network calls."""
from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urldefrag, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
GROUPS = ("官方政策", "訪談逐字稿")


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def records_from(path):
    value = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(value, list):
        return value
    for key in ("records", "items", "sources", "entries"):
        if isinstance(value.get(key), list):
            return value[key]
    raise ValueError(f"Unsupported manifest: {path}")


def local_file(value):
    path = (ROOT / value).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError(f"Path outside snapshot: {value}")
    return path


def canonical_url(value):
    parsed = urlparse(urldefrag(value or "")[0])
    return (parsed.netloc.lower(), unquote(parsed.path).rstrip("/"), parsed.query)


def main():
    records, errors, warnings, corpora = [], [], [], []
    sha_groups = defaultdict(list)
    url_groups = defaultdict(list)
    verified_files = set()
    coverages = {}
    entry_links = defaultdict(list)
    entries_path = ROOT / "訪談逐字稿" / "entries.json"
    if entries_path.exists():
        for entry in records_from(entries_path):
            for ids in entry.get("resource_ids", {}).values():
                for resource_id in ids:
                    entry_links[resource_id].append({"entry_id": entry["id"], "title": entry["title"],
                                                     "transcript_status": entry.get("transcript_status"),
                                                     "warnings": entry.get("warnings", [])})
    for group in GROUPS:
        manifest = ROOT / group / "manifest.json"
        if not manifest.exists():
            raise SystemExit(f"Missing {manifest}")
        coverage = ROOT / group / "coverage.json"
        if coverage.exists():
            coverages[group] = json.loads(coverage.read_text(encoding="utf-8"))
        for original in records_from(manifest):
            record = {"source_group": group, **original}
            record["catalog_id"] = f"{group}:{record.get('id', len(records) + 1)}"
            if group == "訪談逐字稿":
                record["entries"] = entry_links.get(record.get("id"), [])
            records.append(record)
            url_groups[record.get("final_url") or record.get("source_url")].append(record["catalog_id"])
            paths = {}
            for field in ("raw_path", "text_path", "image_path"):
                value = record.get(field)
                if not value:
                    continue
                try:
                    path = local_file(value)
                except ValueError as exc:
                    errors.append(str(exc))
                    continue
                paths[field] = path
                if not path.exists() or not path.is_file():
                    errors.append(f"Missing file: {value}")
                elif path.stat().st_size == 0:
                    errors.append(f"Empty file: {value}")
                else:
                    verified_files.add(str(path.relative_to(ROOT)))
            raw = paths.get("raw_path")
            if raw and raw.is_file() and raw.stat().st_size:
                body = raw.read_bytes()
                actual_sha = hashlib.sha256(body).hexdigest()
                sha_groups[actual_sha].append(record["catalog_id"])
                expected_sha = record.get("sha256")
                if expected_sha and actual_sha != expected_sha:
                    errors.append(f"SHA256 mismatch: {record['raw_path']}")
                expected_bytes = record.get("bytes")
                if isinstance(expected_bytes, int) and len(body) != expected_bytes:
                    errors.append(f"Byte count mismatch: {record['raw_path']}")
                record["verified_sha256"] = actual_sha
            status_code = record.get("http_status")
            if status_code is not None and not 200 <= int(status_code) < 300:
                errors.append(f"HTTP {status_code}: {record.get('source_url')}")
            if not paths:
                warnings.append(f"No local content: {record.get('source_url')}")
            text = paths.get("text_path")
            if not text and raw and raw.suffix.lower() in (".md", ".txt", ".srt", ".vtt"):
                text = raw
            if text and text.suffix.lower() not in (".md", ".txt", ".srt", ".vtt", ".csv", ".json", ".jsonl", ".xml"):
                warnings.append(f"Binary attachment retained outside text corpus: {text.relative_to(ROOT)}")
                text = None
            if text and text.is_file():
                content = text.read_text(encoding="utf-8")
                if content.strip():
                    corpora.append({
                        "id": record["catalog_id"],
                        "source_group": group,
                        "kind": record.get("kind"),
                        "title": record.get("title"),
                        "source_url": record.get("source_url"),
                        "retrieved_at": record.get("retrieved_at"),
                        "raw_path": record.get("raw_path"),
                        "text_path": str(text.relative_to(ROOT)),
                        "sha256": record.get("sha256"),
                        "entries": record.get("entries", []),
                        "source_warnings": record.get("warnings", []),
                        "notes": record.get("notes"),
                        "verification_status": "downloaded_not_fact_checked",
                        "text": content,
                    })

    index_coverage, index_rows = {}, []
    inventory_path = ROOT / "檢查" / "獨立索引盤點.json"
    if inventory_path.exists():
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        for seed in inventory["sources"]:
            official = urlparse(seed["source_url"]).netloc == "puma.taipei"
            group = "官方政策" if official else "訪談逐字稿"
            expected = set()
            for link in seed["links"]:
                parsed = urlparse(link["url"])
                if official:
                    include = parsed.netloc == "puma.taipei" and parsed.path.startswith("/policies/")
                else:
                    include = parsed.scheme in ("http", "https") and not (parsed.netloc == "puma-hub.pages.dev" and parsed.path == "/")
                if include:
                    expected.add(canonical_url(link["url"]))
            saved = {canonical_url(r.get(key)) for r in records if r["source_group"] == group
                     and r.get("raw_path") and r.get("http_status") == 200
                     for key in ("source_url", "final_url") if r.get(key)}
            missing = sorted(expected - saved)
            for host, path, query in sorted(expected):
                index_rows.append({"source_group": group,
                                   "source_url": f"https://{host}{path}" + (f"?{query}" if query else ""),
                                   "archived": (host, path, query) in saved})
            index_coverage[group] = {
                "independently_expected_content_urls": len(expected),
                "matched_content_urls": len(expected & saved),
                "missing_content_urls": [f"https://{host}{path}" + (f"?{query}" if query else "") for host, path, query in missing],
            }
            errors.extend(f"Index URL not archived ({group}): https://{host}{path}" for host, path, query in missing)

    with (ROOT / "來源清單.jsonl").open("w", encoding="utf-8") as out:
        for record in records:
            out.write(json.dumps(record, ensure_ascii=False) + "\n")
    with (ROOT / "全文資料.jsonl").open("w", encoding="utf-8") as out:
        for record in corpora:
            out.write(json.dumps(record, ensure_ascii=False) + "\n")
    columns = ["catalog_id", "source_group", "kind", "title", "source_url", "final_url",
               "retrieved_at", "http_status", "raw_path", "text_path", "image_path", "sha256", "bytes", "notes"]
    with (ROOT / "來源清單.csv").open("w", encoding="utf-8-sig", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            writer.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v
                             for k, v in record.items()})

    files = [p for group in GROUPS for p in (ROOT / group).rglob("*") if p.is_file()]
    report = {
        "verified_at": datetime.now(ZoneInfo("Asia/Taipei")).isoformat(timespec="seconds"),
        "status": "passed" if not errors else "failed",
        "source_records": len(records),
        "by_group": dict(Counter(r["source_group"] for r in records)),
        "by_kind": dict(Counter(r.get("kind", "unknown") for r in records)),
        "text_records": len(corpora),
        "verified_referenced_files": len(verified_files),
        "download_folder_files": len(files),
        "download_folder_bytes": sum(p.stat().st_size for p in files),
        "errors": errors,
        "warnings": warnings,
        "duplicate_raw_content_groups": [ids for ids in sha_groups.values() if len(ids) > 1],
        "duplicate_url_groups": [ids for url, ids in url_groups.items() if url and len(ids) > 1],
        "coverage": coverages,
        "independent_index_coverage": index_coverage,
        "verification_scope": "檔案存在、非空、原始檔SHA256、檔案大小、HTTP結果及清單整合。不是政策事實查核，也不是逐字稿與影音逐句核對。",
    }
    (ROOT / "檢查").mkdir(exist_ok=True)
    save_json(ROOT / "檢查" / "驗證報告.json", report)
    with (ROOT / "檢查" / "索引網址覆蓋.csv").open("w", encoding="utf-8-sig", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=["source_group", "source_url", "archived"])
        writer.writeheader()
        writer.writerows(index_rows)

    lines = ["# 來源資料索引", "", "本索引連結本機下載檔與原始來源；各項內容是否已核對，請以原頁警語與來源狀態為準。", ""]
    for group in GROUPS:
        lines += [f"## {group}", "", "| 類型 | 標題與本機檔案 | 原始來源 |", "|---|---|---|"]
        for record in records:
            if record["source_group"] != group or record.get("kind") == "policy_image":
                continue
            title = str(record.get("title") or record.get("id") or "未命名").replace("|", "\\|").replace("\n", " ")
            path = record.get("text_path") or record.get("raw_path")
            label = f"[{title}](<{path}>)" if path else title
            lines.append(f"| {record.get('kind', '')} | {label} | [來源]({record.get('source_url', '')}) |")
        lines.append("")
    (ROOT / "資料索引.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("status", "source_records", "by_kind", "text_records", "verified_referenced_files", "download_folder_bytes", "errors", "warnings")}, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
