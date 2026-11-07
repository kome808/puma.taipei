#!/usr/bin/env python3
"""Download a bounded, read-only snapshot of the official Puma policy pages.

The snapshot is deliberately limited to the public policy index, the 15 policy
detail pages listed there, and the HEART explainer pages that are linked from
the policy navigation. It does not crawl the whole site or download video.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, unquote
from urllib.request import Request, urlopen

from lxml import html


SNAPSHOT_ROOT = Path(__file__).resolve().parents[1]
ROOT = SNAPSHOT_ROOT / "官方政策"
IMAGE_DIR = ROOT / "images"
BASE_URL = "https://puma.taipei"
POLICY_INDEX_URL = f"{BASE_URL}/policies"
USER_AGENT = "Mozilla/5.0 (compatible; official-policy-snapshot/1.0; read-only)"
RETRIES = 3
RETRY_DELAYS = (1.0, 2.0, 4.0)
BR_MARKER = "\x00"

POLICY_NAMES = [
    "教育政策", "交通政策", "社福政策", "台北文化徑×山林徑", "都市微森林",
    "青年政策", "運動政策", "家庭一站通", "公務員政策", "親子同行卡",
    "水域政策", "AI政策", "客家政策", "城市外交", "營養午餐",
]

FRAMEWORK_SPECS = [
    {"id": "heart_framework", "title": "HEART 政策生態系", "kind": "framework_page", "path": "/heart"},
    {"id": "heart_island", "title": "HEART 政策島", "kind": "framework_page", "path": "/heart-island"},
    {"id": "heart_quiz_1", "title": "伯洋分類帽（HEART 政策分類測驗）", "kind": "framework_page", "path": "/heart/quiz/1"},
    {"id": "heart_axis_h", "title": "HEART 主軸 H", "kind": "heart_axis", "path": "/policy/heart/h"},
    {"id": "heart_axis_e", "title": "HEART 主軸 E", "kind": "heart_axis", "path": "/policy/heart/e"},
    {"id": "heart_axis_a", "title": "HEART 主軸 A", "kind": "heart_axis", "path": "/policy/heart/a"},
    {"id": "heart_axis_r", "title": "HEART 主軸 R", "kind": "heart_axis", "path": "/policy/heart/r"},
    {"id": "heart_axis_t", "title": "HEART 主軸 T", "kind": "heart_axis", "path": "/policy/heart/t"},
]


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_slug(value: str, fallback: str = "source") -> str:
    value = unquote(value).strip().strip("/")
    value = re.sub(r"[^0-9A-Za-z\u3400-\u9fff\u3040-\u30ff._-]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("._-")
    return value or fallback


def request_bytes(url: str) -> tuple[bytes, str, int, str]:
    """Fetch URL with bounded retries; return bytes, final URL, status, type."""
    last_error: Exception | None = None
    for attempt in range(RETRIES):
        try:
            req = Request(url, headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,image/avif,image/webp,image/*,*/*;q=0.5",
            })
            with urlopen(req, timeout=45) as response:
                data = response.read()
                return data, response.geturl(), int(response.status), response.headers.get_content_type() or ""
        except HTTPError as exc:
            last_error = exc
            if int(exc.code) not in {408, 425, 429} and not (500 <= int(exc.code) <= 599):
                raise
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
        if attempt < RETRIES - 1:
            time.sleep(RETRY_DELAYS[attempt])
    assert last_error is not None
    raise last_error


def tree_for(data: bytes) -> html.HtmlElement:
    parser = html.HTMLParser(encoding="utf-8", recover=True)
    return html.fromstring(data, parser=parser)


def text_of(node: html.HtmlElement | None) -> str:
    if node is None:
        return ""
    return re.sub(r"\s+", " ", node.text_content()).strip()


def absolute_url(url: str, base_url: str) -> str:
    return urljoin(base_url, url.strip())


def jsonld_values(tree: html.HtmlElement) -> list[Any]:
    values: list[Any] = []
    for script in tree.xpath('//script[@type="application/ld+json"]'):
        raw = script.text or ""
        if not raw.strip():
            continue
        try:
            values.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return values


def find_jsonld_name(tree: html.HtmlElement) -> str:
    def visit(value: Any) -> str:
        if isinstance(value, dict):
            for key in ("headline", "name"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
            for child in value.values():
                found = visit(child)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = visit(child)
                if found:
                    return found
        return ""
    for value in jsonld_values(tree):
        found = visit(value)
        if found:
            return found
    return ""


def title_from_tree(tree: html.HtmlElement, fallback: str) -> str:
    candidate = find_jsonld_name(tree)
    if candidate:
        return candidate
    og = tree.xpath('string(//meta[@property="og:title"]/@content)').strip()
    if og:
        return og
    h1 = tree.xpath("//main//h1[1]")
    if h1 and text_of(h1[0]):
        return text_of(h1[0])
    title = tree.xpath("string(//title)").strip()
    return title or fallback


def main_content(tree: html.HtmlElement, kind: str) -> html.HtmlElement:
    if kind == "policy_detail":
        nodes = tree.xpath('//article[contains(concat(" ", normalize-space(@class), " "), " policy-page ")]')
        if nodes:
            return nodes[0]
    if kind in {"framework_page", "heart_axis"}:
        nodes = tree.xpath('//main[@id="top"]')
        if nodes:
            return nodes[0]
        nodes = tree.xpath('//main[@id="app"]')
        if nodes:
            return nodes[0]
    nodes = tree.xpath("//main[1]")
    return nodes[0] if nodes else tree


def choose_image_url(node: html.HtmlElement, base_url: str) -> str:
    candidates: list[tuple[int, str]] = []
    for candidate in (node.get("srcset") or "").split(","):
        parts = candidate.strip().split()
        if not parts:
            continue
        width = 0
        if len(parts) > 1 and parts[-1].endswith("w"):
            try:
                width = int(parts[-1][:-1])
            except ValueError:
                pass
        candidates.append((width, parts[0]))
    if node.get("src"):
        candidates.append((10_000, node.get("src") or ""))
    if not candidates:
        return ""
    return absolute_url(max(candidates, key=lambda item: item[0])[1], base_url)


def inline_markdown(node: html.HtmlElement, base_url: str) -> str:
    tag = (node.tag or "").lower() if isinstance(node.tag, str) else ""
    if tag in {"script", "style", "svg", "noscript", "template"}:
        return ""
    if tag == "br":
        return BR_MARKER
    if tag == "img":
        src = choose_image_url(node, base_url)
        if not src:
            return ""
        alt = re.sub(r"\s+", " ", node.get("alt") or "").strip()
        return f"![{alt}]({src})"
    if tag == "a":
        label = inline_children(node, base_url).strip() or node.get("href") or "連結"
        href = absolute_url(node.get("href") or "", base_url)
        return f"[{label}]({href})" if href else label
    pieces: list[str] = [node.text or ""]
    for child in node:
        pieces.append(inline_markdown(child, base_url))
        pieces.append(child.tail or "")
    value = re.sub(r"\s+", " ", "".join(pieces))
    value = value.replace(BR_MARKER, "\n")
    if tag in {"strong", "b"}:
        return f"**{value.strip()}**"
    if tag in {"em", "i"}:
        return f"*{value.strip()}*"
    if tag == "code":
        return f"`{value.strip()}`"
    return value


def inline_children(node: html.HtmlElement, base_url: str) -> str:
    pieces: list[str] = [node.text or ""]
    for child in node:
        pieces.append(inline_markdown(child, base_url))
        pieces.append(child.tail or "")
    value = re.sub(r"\s+", " ", "".join(pieces))
    value = value.replace(BR_MARKER, "\n")
    return value.strip()


SKIP_TAGS = {"script", "style", "svg", "noscript", "template", "nav", "form"}


def render_table(table: html.HtmlElement, base_url: str) -> str:
    rows: list[list[str]] = []
    for tr in table.xpath(".//tr"):
        cells = tr.xpath("./th|./td")
        if cells:
            rows.append([inline_children(cell, base_url).replace("|", "\\|") for cell in cells])
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "| " + " | ".join(["---"] * width) + " |"]
    out.extend("| " + " | ".join(row) + " |" for row in rows[1:])
    return "\n".join(out)


def render_blocks(node: html.HtmlElement, base_url: str) -> list[str]:
    tag = (node.tag or "").lower() if isinstance(node.tag, str) else ""
    if tag in SKIP_TAGS:
        return []
    if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        value = inline_children(node, base_url)
        return [f"{'#' * int(tag[1:])} {value}"] if value else []
    if tag in {"p", "blockquote", "pre", "figcaption", "dt", "dd", "summary"}:
        value = inline_children(node, base_url)
        if not value:
            return []
        if tag == "blockquote":
            return ["\n".join(f"> {line}" for line in value.splitlines())]
        if tag == "pre":
            return [f"```\n{value}\n```"]
        return [value]
    if tag == "li":
        value = inline_children(node, base_url)
        lines = [f"- {value}"] if value else []
        for child in node:
            child_tag = (child.tag or "").lower() if isinstance(child.tag, str) else ""
            if child_tag in {"ul", "ol"}:
                lines.extend("  " + line for line in render_blocks(child, base_url))
        return lines
    if tag in {"ul", "ol"}:
        lines: list[str] = []
        for child in node.xpath("./li"):
            lines.extend(render_blocks(child, base_url))
        return lines
    if tag == "table":
        table = render_table(node, base_url)
        return [table] if table else []
    if tag == "img":
        value = inline_markdown(node, base_url)
        return [value] if value else []
    if tag in {"video", "audio", "iframe", "lite-youtube"}:
        marker = text_of(node) or "影音內容"
        return [f"（{marker}；影音未下載）"]
    lines: list[str] = []
    direct = re.sub(r"\s+", " ", node.text or "").strip()
    if direct and len(node) == 0:
        lines.append(direct)
    for child in node:
        lines.extend(render_blocks(child, base_url))
        tail = re.sub(r"\s+", " ", child.tail or "").strip()
        if tail:
            lines.append(tail)
    return lines


def markdown_for(tree: html.HtmlElement, final_url: str, title: str, source_url: str, retrieved_at: str, kind: str) -> str:
    blocks = render_blocks(main_content(tree, kind), final_url)
    cleaned: list[str] = []
    for block in blocks:
        block = block.strip()
        if block and (not cleaned or block != cleaned[-1]):
            cleaned.append(block)
    header = [
        f"# {title}", "", f"- 來源網址：{source_url}", f"- 最終網址：{final_url}",
        f"- 抓取時間（UTC）：{retrieved_at}", f"- 來源類型：{kind}", "", "---", "",
    ]
    return "\n".join(header + cleaned).rstrip() + "\n"


def is_content_image(img: html.HtmlElement, kind: str) -> bool:
    src = (img.get("src") or "").strip()
    if not src or src.startswith("data:") or src.startswith("activeAnnouncement"):
        return False
    lowered = src.lower()
    if any(token in lowered for token in ("/brand/", "/run-hug/", "favicon", "sprite", "og-default")):
        return False
    if "policy-hero-img" in (" " + (img.get("class") or "") + " "):
        return True
    return kind in {"policy_detail", "heart_axis", "framework_page"}


def image_extension(url: str, content_type: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix and len(suffix) <= 5 and re.match(r"^\.[a-z0-9]+$", suffix):
        return suffix
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg"}.get(content_type.lower(), ".bin")


def parse_index_items(tree: html.HtmlElement) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    for value in jsonld_values(tree):
        candidates = value.get("@graph") if isinstance(value, dict) else value
        candidates = candidates if isinstance(candidates, list) else [value]
        for entity in candidates:
            if not isinstance(entity, dict) or entity.get("@type") != "CollectionPage":
                continue
            main_entity = entity.get("mainEntity", {})
            if not isinstance(main_entity, dict):
                continue
            for entry in main_entity.get("itemListElement", []):
                item = entry.get("item", {}) if isinstance(entry, dict) else {}
                if isinstance(item, dict) and isinstance(item.get("url"), str) and "/policies/" in item["url"] and isinstance(item.get("name"), str):
                    found.append({"title": item["name"], "url": item["url"]})
    if found:
        return found
    main = main_content(tree, "policy_index")
    seen: set[str] = set()
    for anchor in main.xpath('.//a[contains(@href, "/policies/")]'):
        url = absolute_url(anchor.get("href") or "", POLICY_INDEX_URL)
        if url in seen or url.rstrip("/") == POLICY_INDEX_URL:
            continue
        seen.add(url)
        found.append({"title": text_of(anchor), "url": url})
    return found


def relpath(path: Path) -> str:
    return path.relative_to(SNAPSHOT_ROOT).as_posix()


def content_record(*, source_id: str, title: str, kind: str, source_url: str, discovered_from: str,
                   raw_path: Path | None, text_path: Path | None, final_url: str | None,
                   retrieved_at: str, status: str, http_status: int | None, content_type: str,
                   raw_bytes: bytes | None, notes: str = "") -> dict[str, Any]:
    return {
        "id": source_id, "title": title, "kind": kind, "source_url": source_url, "final_url": final_url,
        "retrieved_at": retrieved_at, "status": status, "http_status": http_status,
        "content_type": content_type, "raw_path": relpath(raw_path) if raw_path else None,
        "text_path": relpath(text_path) if text_path else None,
        "sha256": sha256_bytes(raw_bytes) if raw_bytes is not None else None,
        "bytes": len(raw_bytes) if raw_bytes is not None else 0, "discovered_from": discovered_from, "notes": notes,
    }


def fail_note(exc: Exception) -> tuple[int | None, str]:
    return (int(exc.code), f"HTTPError: {exc.reason}") if isinstance(exc, HTTPError) else (None, f"{type(exc).__name__}: {exc}")


def download_page(spec: dict[str, str], discovered_from: str) -> tuple[dict[str, Any], html.HtmlElement | None, str | None]:
    source_url = absolute_url(spec["path"], BASE_URL) if spec.get("path") else spec["url"]
    source_id, kind, retrieved_at = spec["id"], spec["kind"], now_utc()
    raw_path, text_path = ROOT / f"{source_id}.html", ROOT / f"{source_id}.md"
    try:
        raw, final_url, status, content_type = request_bytes(source_url)
        raw_path.write_bytes(raw)
        tree = tree_for(raw)
        title = title_from_tree(tree, spec.get("title", source_id))
        text_path.write_text(markdown_for(tree, final_url, title, source_url, retrieved_at, kind), encoding="utf-8")
        return content_record(source_id=source_id, title=title, kind=kind, source_url=source_url, discovered_from=discovered_from,
                              raw_path=raw_path, text_path=text_path, final_url=final_url, retrieved_at=retrieved_at,
                              status="downloaded", http_status=status, content_type=content_type, raw_bytes=raw,
                              notes="原始 HTML bytes 與可讀 Markdown 已保存；內容未驗證、未改寫。"), tree, final_url
    except Exception as exc:
        status, note = fail_note(exc)
        return content_record(source_id=source_id, title=spec.get("title", source_id), kind=kind, source_url=source_url,
                              discovered_from=discovered_from, raw_path=None, text_path=None, final_url=None,
                              retrieved_at=retrieved_at, status="failed", http_status=status, content_type="", raw_bytes=None,
                              notes=note), None, None


def image_urls_for(tree: html.HtmlElement, kind: str, final_url: str) -> list[str]:
    root = main_content(tree, kind)
    found: list[str] = []
    for img in root.xpath(".//img"):
        if is_content_image(img, kind):
            url = choose_image_url(img, final_url)
            if url and url not in found:
                found.append(url)
    return found


def attachment_specs_for(tree: html.HtmlElement, kind: str, final_url: str) -> list[dict[str, str]]:
    """Return only explicit attachment links inside the selected policy content."""
    if kind != "policy_detail":
        return []
    root = main_content(tree, kind)
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for anchor in root.xpath('.//a[contains(concat(" ", normalize-space(@class), " "), " attachment-link ")]'):
        href = absolute_url(anchor.get("href") or "", final_url)
        if not href or href in seen:
            continue
        seen.add(href)
        filename = anchor.get("download") or text_of(anchor.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " attachment-name ")]')[0] if anchor.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " attachment-name ")]') else None)
        filename = filename.strip() or Path(urlparse(href).path).name or "attachment.bin"
        found.append({"url": href, "filename": filename})
    return found


def save_image(*, source_url: str, page_id: str, page_title: str, page_url: str,
               image_by_url: dict[str, dict[str, Any]], manifest: list[dict[str, Any]]) -> None:
    if source_url in image_by_url:
        existing = image_by_url[source_url]
        existing["notes"] = (existing.get("notes", "") + f"；另見頁面：{page_url}").strip("；")
        return
    retrieved_at, digest_hint = now_utc(), hashlib.sha1(source_url.encode("utf-8")).hexdigest()[:12]
    try:
        raw, final_url, status, content_type = request_bytes(source_url)
        target = IMAGE_DIR / f"{page_id}_{digest_hint}{image_extension(final_url, content_type)}"
        target.write_bytes(raw)
        record = {
            "id": f"{page_id}__image_{digest_hint}", "title": f"{page_title} 圖片 {digest_hint}", "kind": "policy_image",
            "source_url": source_url, "final_url": final_url, "retrieved_at": retrieved_at, "status": "downloaded",
            "http_status": status, "content_type": content_type, "raw_path": relpath(target), "text_path": None,
            "image_path": relpath(target), "sha256": sha256_bytes(raw), "bytes": len(raw),
            "discovered_from": page_url, "notes": "政策內容圖片；排除網站 logo/footer 裝飾，未進行 OCR。",
        }
    except Exception as exc:
        status, note = fail_note(exc)
        record = {
            "id": f"{page_id}__image_{digest_hint}", "title": f"{page_title} 圖片 {digest_hint}", "kind": "policy_image",
            "source_url": source_url, "final_url": None, "retrieved_at": retrieved_at, "status": "failed",
            "http_status": status, "content_type": "", "raw_path": None, "text_path": None, "image_path": None,
            "sha256": None, "bytes": 0, "discovered_from": page_url, "notes": note,
        }
    image_by_url[source_url] = record
    manifest.append(record)


def save_attachment(*, source_url: str, filename: str, page_id: str, page_title: str, page_url: str,
                    attachment_by_url: dict[str, dict[str, Any]], manifest: list[dict[str, Any]]) -> None:
    if source_url in attachment_by_url:
        return
    retrieved_at = now_utc()
    safe_name = safe_slug(filename, "attachment.bin")
    digest_hint = hashlib.sha1(source_url.encode("utf-8")).hexdigest()[:12]
    # Keep the website-provided filename while adding page/hash context to
    # avoid collisions between pages with generic names.
    target = ROOT / "attachments" / f"{page_id}__{safe_name}"
    try:
        raw, final_url, status, content_type = request_bytes(source_url)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        record = {
            "id": f"{page_id}__attachment_{digest_hint}", "title": filename, "kind": "policy_attachment",
            "source_url": source_url, "final_url": final_url, "retrieved_at": retrieved_at, "status": "downloaded",
            "http_status": status, "content_type": content_type, "raw_path": relpath(target), "text_path": None,
            "attachment_path": relpath(target), "sha256": sha256_bytes(raw), "bytes": len(raw),
            "discovered_from": page_url, "notes": f"政策頁明確連結的附件；網站提供檔名：{filename}；未進行 OCR 或內容驗證。",
        }
    except Exception as exc:
        status, note = fail_note(exc)
        record = {
            "id": f"{page_id}__attachment_{digest_hint}", "title": filename, "kind": "policy_attachment",
            "source_url": source_url, "final_url": None, "retrieved_at": retrieved_at, "status": "failed",
            "http_status": status, "content_type": "", "raw_path": None, "text_path": None,
            "attachment_path": None, "sha256": None, "bytes": 0, "discovered_from": page_url, "notes": note,
        }
    attachment_by_url[source_url] = record
    manifest.append(record)


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    ROOT.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []
    page_records: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    omitted = [
        {"url": "https://puma.taipei/heart-island-assets/ and related JS modules", "reason": "HEART 政策島的互動政策資料由 JavaScript 組合；本快照只保存入口 HTML 與靜態文字，未展開全部動態細項。"},
        {"url": "https://puma.taipei/ (whole site)", "reason": "未進行全站爬取；只抓取政策索引列出的政策頁與明確限定的 HEART 框架/軸頁。"},
    ]
    image_by_url: dict[str, dict[str, Any]] = {}
    attachment_by_url: dict[str, dict[str, Any]] = {}

    index_spec = {"id": "policy_index", "title": "政見索引", "kind": "policy_index", "path": "/policies"}
    index_record, index_tree, index_final_url = download_page(index_spec, "seed")
    manifest.append(index_record)
    if index_record["status"] != "downloaded" or index_tree is None or not index_final_url:
        failed.append(index_record)
        write_json(ROOT / "manifest.json", manifest)
        write_json(ROOT / "coverage.json", {"snapshot_date": "2026-11-06", "seed_url": POLICY_INDEX_URL, "failed": failed, "boundary": omitted})
        return 1

    policy_items = parse_index_items(index_tree)
    for position, item in enumerate(policy_items, 1):
        title = item.get("title") or f"政策 {position:02d}"
        slug = safe_slug(urlparse(item["url"]).path.rsplit("/", 1)[-1], f"policy_{position:02d}")
        source_id = f"policy_{position:02d}_{slug}"
        spec = {"id": source_id, "title": title, "kind": "policy_detail", "url": item["url"], "path": ""}
        record, tree, final_url = download_page(spec, POLICY_INDEX_URL)
        manifest.append(record)
        page_records.append(record)
        if record["status"] != "downloaded":
            failed.append(record)
            continue
        for image_url in image_urls_for(tree, "policy_detail", final_url):
            save_image(source_url=image_url, page_id=source_id, page_title=title, page_url=final_url, image_by_url=image_by_url, manifest=manifest)
        for attachment in attachment_specs_for(tree, "policy_detail", final_url):
            save_attachment(source_url=attachment["url"], filename=attachment["filename"], page_id=source_id,
                            page_title=title, page_url=final_url, attachment_by_url=attachment_by_url, manifest=manifest)

    for spec in FRAMEWORK_SPECS:
        record, tree, final_url = download_page(spec, POLICY_INDEX_URL)
        manifest.append(record)
        page_records.append(record)
        if record["status"] != "downloaded":
            failed.append(record)
            continue
        for image_url in image_urls_for(tree, spec["kind"], final_url):
            save_image(source_url=image_url, page_id=spec["id"], page_title=record["title"], page_url=final_url, image_by_url=image_by_url, manifest=manifest)

    expected, indexed_names = set(POLICY_NAMES), [item.get("title", "") for item in policy_items]
    index_notes: list[str] = []
    missing_expected = sorted(expected.difference(indexed_names))
    unexpected = sorted(set(indexed_names).difference(expected))
    if missing_expected:
        index_notes.append("索引未列出預期名稱（僅作檢查，不補抓）：" + ", ".join(missing_expected))
    if unexpected:
        index_notes.append("索引出現未列入預期清單的名稱（仍依索引抓取）：" + ", ".join(unexpected))

    csv_path = ROOT / "政策索引.csv"
    by_url = {record.get("source_url"): record for record in page_records}
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["position", "title", "source_url", "status", "final_url", "raw_path", "text_path", "notes"])
        writer.writeheader()
        for position, item in enumerate(policy_items, 1):
            record = by_url.get(item.get("url"), {})
            writer.writerow({"position": position, "title": item.get("title", ""), "source_url": item.get("url", ""),
                             "status": record.get("status", "not_attempted"), "final_url": record.get("final_url") or "",
                             "raw_path": record.get("raw_path") or "", "text_path": record.get("text_path") or "",
                             "notes": record.get("notes") or ""})

    coverage = {
        "snapshot_date": "2026-11-06", "timezone": "Asia/Taipei", "seed_url": POLICY_INDEX_URL,
        "policy_index_items": [{"position": i + 1, "title": item.get("title", ""), "source_url": item.get("url", "")} for i, item in enumerate(policy_items)],
        "retrieved_pages": [{"id": r.get("id"), "title": r.get("title"), "kind": r.get("kind"), "source_url": r.get("source_url"),
                             "status": r.get("status"), "raw_path": r.get("raw_path"), "text_path": r.get("text_path")} for r in [index_record] + page_records],
        "framework_pages_in_scope": [{"id": s["id"], "title": s["title"], "source_url": absolute_url(s["path"], BASE_URL)} for s in FRAMEWORK_SPECS],
        "failed_or_missing": failed,
        "image_only_content": [{"status": "not_ocr", "identified": [],
                                "notes": "未對政策圖片或圖片附件內文字進行 OCR；無法判定圖片是否含有未出現在 HTML 的政策內容。所有候選內容圖片均以 policy_images 或 policy_attachments 記錄並保留來源頁對應。"}],
        "policy_images": [{"id": r.get("id"), "source_url": r.get("source_url"), "status": r.get("status"), "image_path": r.get("image_path"),
                           "discovered_from": r.get("discovered_from"), "notes": r.get("notes")} for r in manifest if r.get("kind") == "policy_image"],
        "policy_attachments": [{"id": r.get("id"), "title": r.get("title"), "source_url": r.get("source_url"), "status": r.get("status"),
                                "attachment_path": r.get("attachment_path"), "discovered_from": r.get("discovered_from"), "notes": r.get("notes")}
                               for r in manifest if r.get("kind") == "policy_attachment"],
        "omitted_or_not_expanded": omitted,
        "boundary": {"included": ["政策索引 /policies", "索引列出的 15 個政策詳細頁（依當次索引內容）", "HEART 政策生態系 /heart",
                                  "HEART 政策島 /heart-island 的入口 HTML 與靜態文字", "HEART 分類測驗 /heart/quiz/1", "HEART 五個主軸 /policy/heart/{h,e,a,r,t}",
                                  "政策內容圖片（hero、policy card/body、HEART quiz content images；排除 logo/footer 裝飾）"],
                    "excluded": ["影音檔與影音平台內容", "全站其他頁面", "表單提交與任何寫入動作", "未驗證 OCR"],
                    "notes": ["快照保留網站回應的原始 HTML bytes；Markdown 是可讀轉寫，未摘要、翻譯、修錯或補政策。",
                              "網站內容可能在快照後變更；本交付只表示內容已下載，不表示政策已驗證。"] + index_notes},
    }
    write_json(ROOT / "manifest.json", manifest)
    write_json(ROOT / "coverage.json", coverage)
    summary = {"policy_index_count": len(policy_items),
               "policy_detail_count": sum(1 for r in page_records if r.get("kind") == "policy_detail" and r.get("status") == "downloaded"),
               "framework_page_count": sum(1 for r in page_records if r.get("kind") in {"framework_page", "heart_axis"} and r.get("status") == "downloaded"),
               "image_count": sum(1 for r in manifest if r.get("kind") == "policy_image" and r.get("status") == "downloaded"),
               "attachment_count": sum(1 for r in manifest if r.get("kind") == "policy_attachment" and r.get("status") == "downloaded"),
               "failure_count": len(failed) + sum(1 for r in manifest if r.get("kind") == "policy_image" and r.get("status") == "failed"),
               "root": relpath(ROOT)}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
