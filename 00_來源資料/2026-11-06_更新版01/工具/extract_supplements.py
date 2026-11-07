#!/usr/bin/env python3
"""Extract text from official-policy attachments and policy images.

The downloader keeps the original PDF/JPG/image assets.  This companion
extractor reads a downloaded official-policy manifest, uses the PDF text layer
where available, renders only textless PDF pages with ``pdftoppm``, and sends
image inputs to a small macOS Vision helper.  It never edits the source
snapshot.  Results are deliberately marked as machine extraction/OCR and are
not presented as verified policy text.

The same command can be rerun against a later manifest.  Extraction results
are cached by the actual SHA-256 of each asset, so unchanged assets are not
reprocessed when the official downloader refreshes its snapshot.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ALGORITHM_VERSION = "extract-supplements-1.1"
OCR_DISCLAIMER = (
    "OCR 文字為 macOS Vision 自動辨識結果，未逐字進行圖面核驗；"
    "不得視為經人工校對的原文。"
)
PDF_TEXT_DISCLAIMER = (
    "文字來自 PDF 文字層抽取，未逐字進行圖面核驗；"
    "頁面上若另有以圖面呈現的文字，可能未包含。"
)
NO_TEXT_NOTE = "macOS Vision OCR 未辨識到可讀文字；未人工核驗圖面，未虛構內容。"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def manifest_records(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("records", "items", "sources", "entries"):
            items = value.get(key)
            if isinstance(items, list):
                return [item for item in items if isinstance(item, dict)]
    raise ValueError("manifest 必須是陣列，或含 records/items/sources/entries 陣列的物件")


def default_manifest(cwd: Path) -> Path:
    candidates = [
        cwd / "00_來源資料/2026-11-06_更新版01/官方政策/manifest.json",
        cwd / "00_來源資料/2026-11-06/官方政策/manifest.json",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("找不到新版或舊版官方政策 manifest.json；請用 --manifest 指定。")


def safe_local_path(snapshot_root: Path, relative: str | None) -> Path | None:
    if not relative:
        return None
    candidate = (snapshot_root / relative).resolve()
    root = snapshot_root.resolve()
    if not candidate.is_relative_to(root):
        raise ValueError(f"manifest 路徑超出來源快照根目錄：{relative}")
    return candidate


def asset_path(record: dict[str, Any], snapshot_root: Path) -> Path | None:
    kind = str(record.get("kind") or "")
    fields: tuple[str, ...]
    if kind == "policy_image":
        fields = ("image_path", "raw_path", "attachment_path")
    elif kind == "policy_attachment":
        fields = ("attachment_path", "raw_path", "image_path")
    else:
        fields = ("raw_path", "attachment_path", "image_path")
    for field in fields:
        candidate = safe_local_path(snapshot_root, record.get(field))
        if candidate is not None:
            return candidate
    return None


def extension(path: Path) -> str:
    return path.suffix.lower()


def is_pdf(path: Path, record: dict[str, Any]) -> bool:
    content_type = str(record.get("content_type") or "").lower()
    return extension(path) == ".pdf" or content_type == "application/pdf"


def is_image(path: Path, record: dict[str, Any]) -> bool:
    content_type = str(record.get("content_type") or "").lower()
    return content_type.startswith("image/") or extension(path) in {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".bmp", ".heic",
    }


def clean_text(value: str) -> str:
    lines = [line.rstrip() for line in value.replace("\r\n", "\n").replace("\r", "\n").splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    cleaned: list[str] = []
    blank = False
    for line in lines:
        if line.strip():
            cleaned.append(line)
            blank = False
        elif not blank:
            cleaned.append("")
            blank = True
    return "\n".join(cleaned).strip()


def pdf_page_count(pdf: Path) -> int:
    pdfinfo = shutil.which("pdfinfo")
    if pdfinfo:
        try:
            completed = subprocess.run(
                [pdfinfo, str(pdf)], capture_output=True, text=True, check=False, timeout=30
            )
            for line in completed.stdout.splitlines():
                if line.lower().startswith("pages:"):
                    try:
                        return max(0, int(line.split(":", 1)[1].strip()))
                    except ValueError:
                        break
        except (OSError, subprocess.TimeoutExpired):
            pass
    return 0


def pdf_text_pages(pdf: Path, page_count: int) -> tuple[list[str], str | None]:
    pdftotext = shutil.which("pdftotext")
    if not pdftotext:
        return [""] * page_count, "pdftotext_not_found"
    try:
        completed = subprocess.run(
            [pdftotext, "-layout", "-enc", "UTF-8", str(pdf), "-"],
            capture_output=True,
            text=True,
            check=False,
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        return [""] * page_count, "pdftotext_timeout"
    except OSError as exc:
        return [""] * page_count, f"pdftotext_error:{type(exc).__name__}"
    raw_pages = completed.stdout.split("\f")
    # Most PDFs end with a form-feed, which creates one empty trailing chunk.
    if page_count and len(raw_pages) > page_count:
        raw_pages = raw_pages[:page_count]
    if page_count == 0:
        page_count = len(raw_pages)
    pages = [clean_text(raw_pages[i]) if i < len(raw_pages) else "" for i in range(page_count)]
    warning = None
    if completed.returncode != 0:
        warning = f"pdftotext_exit_{completed.returncode}"
    return pages, warning


def compile_vision_helper(source: Path) -> tuple[Path | None, str | None]:
    swiftc = shutil.which("swiftc")
    if not swiftc:
        return None, "swiftc_not_found"
    helper_digest = hashlib.sha256(source.read_bytes()).hexdigest()[:20]
    cache_root = Path(tempfile.gettempdir()) / "extract_supplements_vision"
    cache_root.mkdir(parents=True, exist_ok=True)
    binary = cache_root / f"vision_ocr_{helper_digest}"
    if binary.is_file() and os.access(binary, os.X_OK):
        return binary, None
    module_cache = cache_root / "module-cache"
    module_cache.mkdir(parents=True, exist_ok=True)
    try:
        completed = subprocess.run(
            [swiftc, "-module-cache-path", str(module_cache), str(source), "-o", str(binary)],
            capture_output=True,
            text=True,
            check=False,
            timeout=180,
            env={**os.environ, "SWIFT_MODULECACHE_PATH": str(module_cache)},
        )
    except subprocess.TimeoutExpired:
        return None, "swiftc_timeout"
    except OSError as exc:
        return None, f"swiftc_error:{type(exc).__name__}"
    if completed.returncode != 0 or not binary.is_file():
        details = (completed.stderr or completed.stdout or "compile_failed").strip().replace("\n", " ")
        return None, f"swiftc_failed:{details[:500]}"
    binary.chmod(0o755)
    return binary, None


def parse_vision_output(stdout: str) -> tuple[list[dict[str, Any]], str | None]:
    try:
        value = json.loads(stdout.strip())
    except json.JSONDecodeError:
        return [], "vision_invalid_json"
    if not isinstance(value, dict):
        return [], "vision_invalid_result"
    error = value.get("error")
    lines = value.get("lines")
    if value.get("status") != "ok":
        return [], str(error or "vision_failed")
    if not isinstance(lines, list):
        return [], "vision_invalid_lines"
    normalized: list[dict[str, Any]] = []
    for item in lines:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        confidence = item.get("confidence")
        try:
            confidence = float(confidence) if confidence is not None else None
        except (TypeError, ValueError):
            confidence = None
        normalized.append({"text": text, "confidence": confidence})
    return normalized, None


def vision_ocr(binary: Path | None, image: Path, fallback_error: str | None) -> tuple[list[dict[str, Any]], str | None]:
    if binary is None:
        return [], fallback_error or "vision_unavailable"
    try:
        completed = subprocess.run(
            [str(binary), str(image)], capture_output=True, text=True, check=False, timeout=180
        )
    except subprocess.TimeoutExpired:
        return [], "vision_timeout"
    except OSError as exc:
        return [], f"vision_error:{type(exc).__name__}"
    lines, parse_error = parse_vision_output(completed.stdout)
    if parse_error:
        return [], parse_error
    if completed.returncode != 0:
        return [], f"vision_exit_{completed.returncode}"
    return lines, None


def render_pdf_page(pdf: Path, page: int, temp_root: Path) -> tuple[Path | None, str | None]:
    pdftoppm = shutil.which("pdftoppm")
    if not pdftoppm:
        return None, "pdftoppm_not_found"
    output_base = temp_root / f"page-{page:04d}"
    try:
        completed = subprocess.run(
            [pdftoppm, "-f", str(page), "-l", str(page), "-r", "200", "-singlefile", "-png", str(pdf), str(output_base)],
            capture_output=True,
            text=True,
            check=False,
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        return None, "pdftoppm_timeout"
    except OSError as exc:
        return None, f"pdftoppm_error:{type(exc).__name__}"
    rendered = output_base.with_suffix(".png")
    if completed.returncode != 0 or not rendered.is_file():
        return None, f"pdftoppm_exit_{completed.returncode}"
    return rendered, None


def image_for_ocr(path: Path, temp_root: Path) -> tuple[Path | None, str | None]:
    # Vision can read the common formats directly.  The caller retries with a
    # PNG conversion when ImageIO cannot decode a newer/web image format.
    return path, None


def convert_image_to_png(path: Path, temp_root: Path) -> tuple[Path | None, str | None]:
    sips = shutil.which("sips")
    if not sips:
        return None, "sips_not_found"
    converted = temp_root / "image-for-vision.png"
    try:
        completed = subprocess.run(
            [sips, "-s", "format", "png", "-s", "formatOptions", "best", str(path), "--out", str(converted)],
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return None, "sips_timeout"
    except OSError as exc:
        return None, f"sips_error:{type(exc).__name__}"
    if completed.returncode != 0 or not converted.is_file():
        return None, f"sips_exit_{completed.returncode}"
    return converted, None


def page_record(
    *,
    page_number: int,
    text: str,
    method: str,
    ocr_status: str,
    notes: list[str] | None = None,
    confidence: list[float] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "page_number": page_number,
        "pdf_page": page_number,
        "text": text,
        "method": method,
        "ocr_status": ocr_status,
        "verification": list(notes or []),
    }
    if confidence is not None:
        result["ocr_confidence"] = confidence
    return result


def extract_pdf(
    path: Path,
    binary: Path | None,
    binary_error: str | None,
    temp_root: Path,
) -> dict[str, Any]:
    pages_count = pdf_page_count(path)
    text_pages, text_warning = pdf_text_pages(path, pages_count)
    if pages_count == 0:
        pages_count = len(text_pages)
    pages: list[dict[str, Any]] = []
    for index in range(pages_count):
        page_no = index + 1
        text = text_pages[index] if index < len(text_pages) else ""
        if text:
            notes = [PDF_TEXT_DISCLAIMER]
            if text_warning:
                notes.append(text_warning)
            pages.append(page_record(
                page_number=page_no,
                text=text,
                method="pdf_text",
                ocr_status="not_needed_text_layer",
                notes=notes,
            ))
            continue
        rendered, render_error = render_pdf_page(path, page_no, temp_root)
        if render_error or rendered is None:
            notes = [NO_TEXT_NOTE, render_error or "pdf_render_failed"]
            if text_warning:
                notes.append(text_warning)
            pages.append(page_record(
                page_number=page_no,
                text="",
                method="none",
                ocr_status="render_failed",
                notes=notes,
            ))
            continue
        lines, ocr_error = vision_ocr(binary, rendered, binary_error)
        ocr_text = "\n".join(str(item["text"]) for item in lines)
        confidence = [item["confidence"] for item in lines if item.get("confidence") is not None]
        if ocr_text:
            pages.append(page_record(
                page_number=page_no,
                text=ocr_text,
                method="vision_ocr",
                ocr_status="used_unverified",
                notes=[OCR_DISCLAIMER],
                confidence=confidence,
            ))
        else:
            notes = [NO_TEXT_NOTE]
            if ocr_error:
                notes.append(ocr_error)
            pages.append(page_record(
                page_number=page_no,
                text="",
                method="none",
                ocr_status="unavailable" if ocr_error else "vision_no_text_detected",
                notes=notes,
            ))
    return {
        "page_count": pages_count,
        "pages": pages,
        "warnings": [warning for warning in (text_warning,) if warning],
    }


def extract_image(
    path: Path,
    binary: Path | None,
    binary_error: str | None,
    temp_root: Path,
) -> dict[str, Any]:
    ocr_path, conversion_error = image_for_ocr(path, temp_root)
    lines: list[dict[str, Any]] = []
    ocr_error = conversion_error
    if ocr_path is not None:
        lines, ocr_error = vision_ocr(binary, ocr_path, binary_error)
        if not lines and ocr_error and extension(path) not in {".jpg", ".jpeg", ".png"}:
            converted, convert_error = convert_image_to_png(path, temp_root)
            if converted is not None:
                lines, retry_error = vision_ocr(binary, converted, binary_error)
                ocr_error = retry_error
            elif convert_error:
                ocr_error = f"{ocr_error};{convert_error}"
    text = "\n".join(str(item["text"]) for item in lines)
    confidence = [item["confidence"] for item in lines if item.get("confidence") is not None]
    if text:
        page = page_record(
            page_number=1,
            text=text,
            method="vision_ocr",
            ocr_status="used_unverified",
            notes=[OCR_DISCLAIMER],
            confidence=confidence,
        )
        status = "extracted"
    else:
        notes = [NO_TEXT_NOTE]
        if ocr_error:
            notes.append(ocr_error)
        page = page_record(
            page_number=1,
            text="",
            method="none",
            ocr_status="unavailable" if ocr_error else "vision_no_text_detected",
            notes=notes,
        )
        status = "no_text_detected"
    return {"page_count": 1, "pages": [page], "warnings": [], "status": status}


def combine_text(pages: Iterable[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for page in pages:
        text = str(page.get("text") or "").strip()
        if text:
            if len(pages) == 1:  # type: ignore[arg-type]
                chunks.append(text)
            else:
                chunks.append(f"--- PDF page {page.get('page_number')} ---\n{text}")
    return "\n\n".join(chunks)


def extraction_status(pages: list[dict[str, Any]]) -> str:
    methods = {str(page.get("method")) for page in pages}
    if "pdf_text" in methods and "vision_ocr" in methods:
        return "extracted_mixed"
    if "pdf_text" in methods:
        return "extracted_pdf_text"
    if "vision_ocr" in methods:
        return "extracted_vision_ocr"
    if pages and all(page.get("ocr_status") == "unavailable" for page in pages):
        return "ocr_unavailable"
    return "no_text_detected"


def cache_entry(extraction: dict[str, Any], actual_sha: str) -> dict[str, Any]:
    return {
        "algorithm_version": ALGORITHM_VERSION,
        "sha256": actual_sha,
        "page_count": extraction.get("page_count", 0),
        "pages": extraction.get("pages", []),
        "warnings": extraction.get("warnings", []),
    }


def load_cache(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"version": 1, "assets": {}}
    try:
        value = read_json(path)
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "assets": {}}
    if not isinstance(value, dict) or not isinstance(value.get("assets"), dict):
        return {"version": 1, "assets": {}}
    return value


def save_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def asset_record(
    source: dict[str, Any],
    local: Path | None,
    snapshot_root: Path,
    extraction: dict[str, Any],
    *,
    actual_sha: str | None,
    manifest_sha: str | None,
    sha_verified: bool | None,
    cache_hit: bool,
    status_override: str | None = None,
) -> dict[str, Any]:
    pages = extraction.get("pages", []) if isinstance(extraction.get("pages"), list) else []
    status = status_override or extraction_status(pages)
    if local is None or not local.is_file():
        status = "missing_asset"
    elif actual_sha is not None and manifest_sha and actual_sha != manifest_sha:
        status = "sha_mismatch"
    record: dict[str, Any] = {
        "asset_id": source.get("id"),
        "title": source.get("title"),
        "kind": source.get("kind"),
        "source_url": source.get("source_url"),
        "final_url": source.get("final_url"),
        "discovered_from": source.get("discovered_from"),
        "local_path": str(local.relative_to(snapshot_root)) if local and local.is_relative_to(snapshot_root) else source.get("raw_path"),
        "file_name": local.name if local else None,
        "content_type": source.get("content_type") or (mimetypes.guess_type(local.name)[0] if local else None),
        "bytes": local.stat().st_size if local and local.is_file() else source.get("bytes", 0),
        "sha256": actual_sha,
        "manifest_sha256": manifest_sha,
        "sha256_verified": sha_verified,
        "cache_hit": cache_hit,
        "status": status,
        "algorithm_version": ALGORITHM_VERSION,
        "page_count": extraction.get("page_count", len(pages)),
        "text_page_count": sum(1 for page in pages if page.get("text")),
        "ocr_page_count": sum(1 for page in pages if page.get("method") == "vision_ocr"),
        "extraction_methods": sorted({str(page.get("method") or "none") for page in pages}),
        "text": combine_text(pages),
        "pages": pages,
        "warnings": extraction.get("warnings", []),
    }
    return record


def process_asset(
    source: dict[str, Any],
    snapshot_root: Path,
    cache: dict[str, Any],
    binary: Path | None,
    binary_error: str | None,
) -> dict[str, Any]:
    local = asset_path(source, snapshot_root)
    manifest_sha = source.get("sha256")
    if manifest_sha is not None:
        manifest_sha = str(manifest_sha)
    if local is None or not local.is_file():
        return asset_record(source, local, snapshot_root, {"page_count": 0, "pages": [], "warnings": ["local_asset_missing"]},
                            actual_sha=None, manifest_sha=manifest_sha, sha_verified=None, cache_hit=False)
    actual_sha = sha256_file(local)
    sha_verified = bool(manifest_sha and manifest_sha == actual_sha)
    cached = cache.setdefault("assets", {}).get(actual_sha)
    if isinstance(cached, dict) and cached.get("algorithm_version") == ALGORITHM_VERSION and isinstance(cached.get("pages"), list):
        extraction = {
            "page_count": cached.get("page_count", len(cached["pages"])),
            "pages": cached["pages"],
            "warnings": cached.get("warnings", []),
        }
        return asset_record(source, local, snapshot_root, extraction, actual_sha=actual_sha,
                            manifest_sha=manifest_sha, sha_verified=sha_verified, cache_hit=True)
    with tempfile.TemporaryDirectory(prefix="extract-supplements-") as temporary:
        temp_root = Path(temporary)
        if is_pdf(local, source):
            extraction = extract_pdf(local, binary, binary_error, temp_root)
        elif is_image(local, source):
            extraction = extract_image(local, binary, binary_error, temp_root)
        else:
            extraction = {"page_count": 0, "pages": [], "warnings": ["unsupported_asset_type"]}
    cache.setdefault("assets", {})[actual_sha] = cache_entry(extraction, actual_sha)
    return asset_record(source, local, snapshot_root, extraction, actual_sha=actual_sha,
                        manifest_sha=manifest_sha, sha_verified=sha_verified, cache_hit=False)


def build_coverage(
    *,
    manifest_path: Path,
    snapshot_root: Path,
    output_dir: Path,
    records: list[dict[str, Any]],
    manifest_count: int,
    cache_path: Path,
    vision_error: str | None,
) -> dict[str, Any]:
    by_kind = Counter(str(record.get("kind") or "unknown") for record in records)
    by_status = Counter(str(record.get("status") or "unknown") for record in records)
    by_method = Counter(
        str(page.get("method") or "none")
        for record in records
        for page in record.get("pages", [])
    )
    by_ocr = Counter(
        str(page.get("ocr_status") or "unknown")
        for record in records
        for page in record.get("pages", [])
    )
    return {
        "generated_at": utc_now(),
        "manifest_path": str(manifest_path),
        "snapshot_root": str(snapshot_root),
        "output_dir": str(output_dir),
        "cache_path": str(cache_path),
        "algorithm_version": ALGORITHM_VERSION,
        "manifest_records_total": manifest_count,
        "asset_records_total": len(records),
        "asset_records_covered": sum(1 for record in records if record.get("status") != "missing_asset"),
        "asset_records_missing": sum(1 for record in records if record.get("status") == "missing_asset"),
        "sha256_mismatch_count": sum(1 for record in records if record.get("status") == "sha_mismatch"),
        "by_kind": dict(by_kind),
        "by_status": dict(by_status),
        "by_page_method": dict(by_method),
        "by_ocr_status": dict(by_ocr),
        "vision_helper": {"status": "unavailable" if vision_error else "ready", "error": vision_error},
        "ocr_disclaimer": OCR_DISCLAIMER,
        "pdf_text_disclaimer": PDF_TEXT_DISCLAIMER,
        "scope": {
            "included_manifest_kinds": ["policy_attachment", "policy_image"],
            "excluded": "HTML pages and other manifest records are not duplicated here; source HTML remains in the official snapshot.",
            "no_text_policy": NO_TEXT_NOTE,
        },
        "assets": [
            {
                "asset_id": record.get("asset_id"),
                "kind": record.get("kind"),
                "title": record.get("title"),
                "source_url": record.get("source_url"),
                "discovered_from": record.get("discovered_from"),
                "sha256": record.get("sha256"),
                "manifest_sha256": record.get("manifest_sha256"),
                "sha256_verified": record.get("sha256_verified"),
                "local_path": record.get("local_path"),
                "status": record.get("status"),
                "page_count": record.get("page_count"),
                "text_page_count": record.get("text_page_count"),
                "ocr_page_count": record.get("ocr_page_count"),
                "cache_hit": record.get("cache_hit"),
            }
            for record in records
        ],
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, help="官方政策 manifest.json；未指定時先找新版再找舊版")
    parser.add_argument("--output-dir", type=Path, help="補充文字輸出目錄；預設為 manifest 同一快照的補充文字/")
    parser.add_argument("--no-vision", action="store_true", help="不編譯/執行 macOS Vision helper，僅抽取 PDF 文字層")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    cwd = Path.cwd()
    manifest_path = (args.manifest or default_manifest(cwd)).resolve()
    if not manifest_path.is_file():
        raise SystemExit(f"manifest 不存在：{manifest_path}")
    snapshot_root = manifest_path.parent.parent.resolve()
    output_dir = (args.output_dir or (snapshot_root / "補充文字")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_path = output_dir / "cache.json"
    cache = load_cache(cache_path)

    helper_source = Path(__file__).with_name("extract_supplements_vision.swift")
    if args.no_vision:
        binary, vision_error = None, "disabled_by_flag"
    elif helper_source.is_file():
        binary, vision_error = compile_vision_helper(helper_source)
    else:
        binary, vision_error = None, "vision_helper_source_missing"

    all_records = manifest_records(read_json(manifest_path))
    sources = [record for record in all_records if record.get("kind") in {"policy_attachment", "policy_image"}]
    output_records: list[dict[str, Any]] = []
    for index, source in enumerate(sources, 1):
        print(f"[{index}/{len(sources)}] {source.get('id') or source.get('title') or 'asset'}", file=sys.stderr)
        output_records.append(process_asset(source, snapshot_root, cache, binary, vision_error))

    save_json_atomic(cache_path, cache)
    jsonl_path = output_dir / "全文.jsonl"
    temporary_jsonl = output_dir / f".{jsonl_path.name}.tmp-{os.getpid()}"
    with temporary_jsonl.open("w", encoding="utf-8") as handle:
        for record in output_records:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(temporary_jsonl, jsonl_path)
    coverage = build_coverage(
        manifest_path=manifest_path,
        snapshot_root=snapshot_root,
        output_dir=output_dir,
        records=output_records,
        manifest_count=len(all_records),
        cache_path=cache_path,
        vision_error=vision_error,
    )
    save_json_atomic(output_dir / "coverage.json", coverage)
    print(json.dumps({
        "manifest": str(manifest_path),
        "output": str(output_dir),
        "assets": len(output_records),
        "status": dict(Counter(record.get("status") for record in output_records)),
        "cache_hits": sum(1 for record in output_records if record.get("cache_hit")),
        "vision_helper": coverage["vision_helper"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"extract_supplements: {exc}", file=sys.stderr)
        raise SystemExit(2)
