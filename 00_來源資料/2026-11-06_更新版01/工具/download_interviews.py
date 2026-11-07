#!/usr/bin/env python3
"""Read-only collector for the PUMA HUB article/transcript sources.

The collector starts from the cards on the hub index, fetches each linked
article/transcript page and follows only text attachments linked there.  It
records video/audio URLs without downloading media and keeps raw bytes beside
generated readable Markdown.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import time
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from lxml import etree, html


TIMEZONE = "Asia/Taipei"
TAIPEI_TZ = ZoneInfo(TIMEZONE)
SNAPSHOT_DATE = datetime.now(TAIPEI_TZ).date().isoformat()
INDEX_URL = "https://puma-hub.pages.dev/#all"
USER_AGENT = "PUMA-HUB-source-collector/1.0 (+read-only archival collection)"
TEXT_EXTENSIONS = {".md", ".markdown", ".txt", ".srt", ".vtt", ".csv", ".json", ".xml", ".text"}
VIDEO_HOSTS = {
    "youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com",
    "www.youtube-nocookie.com", "facebook.com", "www.facebook.com", "fb.watch",
    "instagram.com", "www.instagram.com", "tiktok.com", "www.tiktok.com", "vimeo.com",
    "www.vimeo.com", "bilibili.com", "www.bilibili.com", "soundcloud.com", "open.spotify.com",
    "podcasts.apple.com",
}
WARNING_RE = re.compile(
    r"(未核對|尚未逐句對照|待核對|可能有.{0,20}(?:錯誤|問題)|needs verification|核對原片|引用前請核對|僅供參考|來源不明)",
    re.IGNORECASE,
)


def clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def canonical_url(url: str, base: str | None = None) -> str:
    absolute = urljoin(base or INDEX_URL, url)
    absolute, _fragment = urldefrag(absolute)
    parts = urlsplit(absolute)
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", parts.query, ""))


def url_path_suffix(url: str) -> str:
    return Path(urlsplit(url).path.lower()).suffix


def is_text_attachment(url: str, anchor: Any | None = None) -> bool:
    if url_path_suffix(url) in TEXT_EXTENSIONS:
        return True
    if anchor is not None and anchor.get("download") is not None:
        label = clean_text(" ".join(anchor.itertext()))
        return "下載" in label or "原稿" in label or "逐字" in label
    return False


def is_transcript_page(url: str, label: str = "") -> bool:
    path = urlsplit(url).path.lower().rstrip("/")
    text = f"{path} {label.lower()}"
    return "/transcript" in path or any(token in text for token in ("逐字稿", "逐字紀錄", "原稿", "transcript"))


def is_video_url(url: str) -> bool:
    parts = urlsplit(url)
    host = parts.netloc.lower().split(":", 1)[0]
    if host in VIDEO_HOSTS or any(host.endswith("." + h) for h in VIDEO_HOSTS):
        return True
    low = url.lower()
    return any(token in low for token in ("/watch", "/video", "/videos", "/live/", "youtu.be/"))


def video_identity(url: str) -> str:
    """Deduplicate timestamped links to the same video while keeping first URL."""
    parts = urlsplit(url)
    host = parts.netloc.lower().split(":", 1)[0]
    if host in {"youtu.be", "www.youtu.be"}:
        return f"youtube:{parts.path.strip('/').split('/')[0]}"
    if host.endswith("youtube.com"):
        query = dict(item.split("=", 1) for item in parts.query.split("&") if "=" in item)
        if query.get("v"):
            return f"youtube:{query['v']}"
        return f"youtube:{parts.path.rstrip('/')}"
    return urlunsplit((parts.scheme, host, parts.path.rstrip('/'), "", ""))


def short_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:10]


def resource_id(kind: str, url: str) -> str:
    parts = urlsplit(url)
    host = re.sub(r"[^a-z0-9]+", "-", parts.netloc.lower()).strip("-") or "source"
    path = parts.path.strip("/") or "root"
    slug = re.sub(r"[^A-Za-z0-9\u4e00-\u9fff]+", "-", path).strip("-").lower()[:90] or "root"
    return f"{kind}-{host}-{slug}-{short_hash(url)}"


def safe_filename(value: str, max_len: int = 150) -> str:
    value = re.sub(r"[^A-Za-z0-9\u4e00-\u9fff._-]+", "-", value).strip("-._")
    return (value or "resource")[:max_len]


def now_iso() -> str:
    return datetime.now(TAIPEI_TZ).isoformat(timespec="seconds")


class Fetcher:
    def __init__(self, retries: int = 3, delay: float = 0.5, timeout: float = 40.0):
        self.retries = max(1, retries)
        self.delay = max(0.0, delay)
        self.timeout = timeout

    def fetch(self, url: str) -> dict[str, Any]:
        last_error = ""
        for attempt in range(1, self.retries + 1):
            request = Request(url, headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html, text/plain, text/markdown, text/csv, application/json, */*",
                "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
            })
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    data = response.read()
                    status = int(response.getcode() or 200)
                    result = {
                        "status": "ok" if 200 <= status < 400 else "http_error",
                        "http_status": status,
                        "final_url": response.geturl(),
                        "content_type": response.headers.get("Content-Type", ""),
                        "bytes_data": data,
                        "error": None,
                        "attempts": attempt,
                    }
                    if status >= 500 and attempt < self.retries:
                        time.sleep(self.delay * attempt)
                        continue
                    return result
            except HTTPError as exc:
                try:
                    body = exc.read()
                except Exception:
                    body = b""
                status = int(exc.code or 0)
                last_error = f"HTTPError {status}: {exc.reason}"
                if (status in {408, 425, 429} or status >= 500) and attempt < self.retries:
                    time.sleep(self.delay * attempt)
                    continue
                return {
                    "status": "http_error", "http_status": status,
                    "final_url": getattr(exc, "url", url),
                    "content_type": exc.headers.get("Content-Type", "") if exc.headers else "",
                    "bytes_data": body, "error": last_error, "attempts": attempt,
                }
            except (URLError, TimeoutError, OSError) as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                if attempt < self.retries:
                    time.sleep(self.delay * attempt)
                    continue
                return {
                    "status": "error", "http_status": None, "final_url": url,
                    "content_type": "", "bytes_data": b"", "error": last_error,
                    "attempts": attempt,
                }
        return {
            "status": "error", "http_status": None, "final_url": url,
            "content_type": "", "bytes_data": b"", "error": last_error or "unknown fetch error",
            "attempts": self.retries,
        }


def parse_html(data: bytes) -> Any:
    return html.fromstring(data, parser=html.HTMLParser(encoding="utf-8", recover=True))


def extract_title(root: Any, fallback: str = "") -> str:
    for xp in ("//h1[1]", "//title[1]"):
        values = root.xpath(xp)
        if values:
            value = clean_text(" ".join(values[0].itertext()))
            if value:
                return value
    return fallback


def inline_markdown(node: Any, base_url: str) -> str:
    if isinstance(node, str):
        return node
    tag = (node.tag or "").lower() if isinstance(node.tag, str) else ""
    if tag in {"script", "style", "noscript", "template", "svg"}:
        return ""
    if tag == "br":
        return "\n"
    if tag == "a":
        label = clean_text((node.text or "") + "".join(inline_markdown(c, base_url) + (c.tail or "") for c in node))
        href = node.get("href")
        if href and not href.startswith("#"):
            return f"[{label or href}]({canonical_url(href, base_url)})"
        return label
    text = node.text or ""
    text += "".join(inline_markdown(c, base_url) + (c.tail or "") for c in node)
    if tag in {"strong", "b"} and clean_text(text):
        return f"**{clean_text(text)}**"
    if tag in {"em", "i"} and clean_text(text):
        return f"*{clean_text(text)}*"
    if tag == "code" and clean_text(text):
        return f"`{clean_text(text)}`"
    return text


def render_markdown(node: Any, base_url: str, list_depth: int = 0) -> list[str]:
    """Render DOM text while retaining collapsed/details content."""
    if not isinstance(node.tag, str):
        return []
    tag = node.tag.lower()
    if tag in {"script", "style", "noscript", "template", "svg"}:
        return []
    if tag == "details":
        out: list[str] = []
        summary = node.xpath("./summary[1]")
        if summary:
            out.append(f"**{clean_text(inline_markdown(summary[0], base_url))}**")
        for child in node:
            if summary and child is summary[0]:
                continue
            out.extend(render_markdown(child, base_url, list_depth))
        return out
    if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        return [f"{'#' * int(tag[1])} {clean_text(inline_markdown(node, base_url))}"]
    if tag in {"p", "div", "section", "article", "main", "header", "footer", "aside"}:
        children = list(node)
        block_children = [c for c in children if isinstance(c.tag, str) and c.tag.lower() not in {"a", "span", "strong", "em", "b", "i", "code", "br"}]
        if not block_children:
            value = clean_text(inline_markdown(node, base_url))
            return [value] if value else []
        out: list[str] = []
        own_text = clean_text(node.text or "")
        if own_text:
            out.append(own_text)
        for child in children:
            out.extend(render_markdown(child, base_url, list_depth))
            if child.tail and clean_text(child.tail):
                out.append(clean_text(child.tail))
        return out
    if tag in {"ul", "ol"}:
        out = []
        index = 1
        for child in node:
            if not isinstance(child.tag, str) or child.tag.lower() != "li":
                out.extend(render_markdown(child, base_url, list_depth))
                continue
            prefix = f"{'  ' * list_depth}{index}. " if tag == "ol" else f"{'  ' * list_depth}- "
            nested: list[str] = []
            plain_parts: list[str] = []
            for grandchild in child:
                gtag = grandchild.tag.lower() if isinstance(grandchild.tag, str) else ""
                if gtag in {"ul", "ol"}:
                    nested.extend(render_markdown(grandchild, base_url, list_depth + 1))
                else:
                    plain_parts.append(inline_markdown(grandchild, base_url))
            value = clean_text((child.text or "") + "".join(plain_parts))
            if value:
                out.append(prefix + value)
            out.extend(nested)
            index += 1
        return out
    if tag == "blockquote":
        return [f"> {clean_text(inline_markdown(node, base_url))}"]
    if tag == "hr":
        return ["---"]
    if tag == "pre":
        return ["```", node.text or "", "```"]
    if tag == "table":
        rows: list[str] = []
        for tr in node.xpath(".//tr"):
            cells = [clean_text(inline_markdown(td, base_url)) for td in tr.xpath("./th|./td")]
            if cells:
                rows.append("| " + " | ".join(cells) + " |")
        if rows and len(rows) > 1:
            cols = len(rows[0].split("|")) - 2
            rows.insert(1, "| " + " | ".join(["---"] * max(cols, 1)) + " |")
        return rows
    value = clean_text(inline_markdown(node, base_url))
    return [value] if value else []


def readable_markdown(root: Any, source_url: str) -> str:
    candidates = root.xpath('//*[contains(concat(" ", normalize-space(@class), " "), " article-content ")]')
    content = candidates[0] if candidates else (root.xpath("//main[1]") or [root])[0]
    lines = [f"# {extract_title(root, source_url)}", "", f"來源：{source_url}", ""]
    for line in render_markdown(content, source_url):
        line = line.rstrip()
        if line:
            lines.append(line)
        elif lines and lines[-1] != "":
            lines.append("")
    output: list[str] = []
    for line in lines:
        if line == "" and output and output[-1] == "":
            continue
        output.append(line)
    return "\n".join(output).rstrip() + "\n"


def extract_warnings(root: Any) -> list[str]:
    warnings: list[str] = []
    for node in root.xpath("//*[contains(@class, 'source-note') or contains(@class, 'warning')]"):
        text = clean_text(" ".join(node.itertext()))
        if text and text not in warnings:
            warnings.append(text)
    # Avoid treating a whole article/container as a warning merely because a
    # descendant contains the phrase "needs verification".
    for node in root.xpath("//p|//li|//small|//span|//strong|//em"):
        text = clean_text(" ".join(node.itertext()))
        if text and len(text) <= 2000 and WARNING_RE.search(text) and text not in warnings:
            warnings.append(text)
    return warnings


def extract_video_urls(data: bytes, root: Any, page_url: str) -> list[str]:
    candidates: list[str] = []
    for attr in ("href", "src", "data-src", "content"):
        for node in root.xpath(f"//*[@{attr}]"):
            value = node.get(attr)
            if value and value.startswith(("http://", "https://")):
                candidates.append(value)
    # JSON-LD often carries isBasedOn even when there is no visible source link.
    candidates.extend(re.findall(r"https?://[^\"'<>\s]+", data.decode("utf-8", errors="replace")))
    out: list[str] = []
    seen: set[str] = set()
    for value in candidates:
        value = canonical_url(value, page_url)
        identity = video_identity(value)
        if is_video_url(value) and identity not in seen:
            seen.add(identity)
            out.append(value)
    return out


def classify_attachment(url: str, label: str, page_kind: str) -> str:
    """Classify a text/original download without guessing from extension alone."""
    low_url = url.lower()
    low_label = label.lower()
    if any(token in low_label for token in ("整理文章", "精華文章", "下載文章")) or low_url.endswith("/article.md"):
        return "article_attachment"
    if any(token in low_label for token in ("逐字", "原稿", "字幕", "原始 word", "原始 markdown", "來源逐字", "完整逐字")):
        return "transcript_attachment"
    if "/transcript" in low_url or page_kind == "transcript_page":
        return "transcript_attachment"
    if low_url.endswith((".srt", ".vtt")):
        return "transcript_attachment"
    if "重點紀錄" in label or "source-notes" in low_url:
        return "source_notes_attachment"
    return "text_attachment"


def discover_attachments(root: Any, page_url: str, page_kind: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for anchor in root.xpath("//a[@href]"):
        href = anchor.get("href") or ""
        if href.startswith(("mailto:", "javascript:", "#")):
            continue
        url = canonical_url(href, page_url)
        if is_text_attachment(url, anchor) and not any(item["url"] == url for item in out):
            label = clean_text(" ".join(anchor.itertext()))
            out.append({"url": url, "label": label, "kind": classify_attachment(url, label, page_kind)})
    return out


def discover_transcript_links(root: Any, page_url: str) -> list[str]:
    out: list[str] = []
    for anchor in root.xpath("//a[@href]"):
        href = anchor.get("href") or ""
        if href.startswith(("mailto:", "javascript:", "#")):
            continue
        if urlsplit(href).fragment:
            continue
        label = clean_text(" ".join(anchor.itertext()))
        url = canonical_url(href, page_url)
        if url_path_suffix(url) in TEXT_EXTENSIONS:
            continue
        if is_video_url(url):
            # External audiovisual sources are recorded on the owning entry,
            # never fetched or counted as transcript pages.
            continue
        if url == canonical_url(page_url):
            continue
        target_host = urlsplit(url).netloc.lower()
        target_path = urlsplit(url).path.lower()
        target_is_transcript_route = "/transcript" in target_path or "transcript" in target_host
        if target_is_transcript_route and is_transcript_page(url, label) and url not in out:
            out.append(url)
    return out


def inline_transcript_present(root: Any) -> bool:
    selectors = [
        '//*[contains(concat(" ", normalize-space(@class), " "), " transcript-text ")]',
        '//*[contains(concat(" ", normalize-space(@class), " "), " transcript-box ")]',
        '//*[contains(translate(@id, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "transcript")]',
    ]
    for selector in selectors:
        for node in root.xpath(selector):
            text = clean_text(" ".join(node.itertext()))
            # A heading or a link saying "附逐字稿" is not proof of a full
            # transcript.  Require a substantial transcript container.
            if len(text) >= 500:
                return True
    # Some older pages do not use transcript classes.  Require repeated
    # speaker/timestamp-like lines plus enough body text before treating them
    # as a complete inline transcript.
    body_text = clean_text(" ".join(root.xpath("//body[1]//text()")))
    timestamp_hits = len(re.findall(r"(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?|(?:沈伯洋|主持人?|來賓|記者)\s*[：:])", body_text))
    if len(body_text) >= 800 and timestamp_hits >= 5:
        return True
    return False


def card_entries(index_root: Any) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for section in index_root.xpath('//section[@id="featured" or @id="talks" or @id="sessions"]'):
        section_id = section.get("id") or "unknown"
        for ordinal, card in enumerate(section.xpath('.//article[contains(@class,"card")]'), 1):
            title = clean_text(" ".join(card.xpath(".//h3[1]//text()")))
            description = clean_text(" ".join(card.xpath(".//p[1]//text()")))
            meta = [clean_text(" ".join(node.itertext())) for node in card.xpath('.//*[contains(@class,"card__meta")]//span')]
            source_urls: list[str] = []
            article_urls: list[str] = []
            transcript_urls: list[str] = []
            for anchor in card.xpath(".//a[@href]"):
                href = anchor.get("href") or ""
                if href.startswith(("#", "mailto:", "javascript:")):
                    continue
                url = canonical_url(href, INDEX_URL)
                label = clean_text(" ".join(anchor.itertext()))
                if url not in source_urls:
                    source_urls.append(url)
                if is_text_attachment(url, anchor):
                    continue
                if is_transcript_page(url, label):
                    if url not in transcript_urls:
                        transcript_urls.append(url)
                elif url not in article_urls:
                    article_urls.append(url)
            entry_id = f"entry-{section_id}-{ordinal:02d}-{short_hash(title + '|' + '|'.join(source_urls))}"
            entries.append({
                "id": entry_id,
                "title": title,
                "kind": "interview" if section_id in {"featured", "talks"} else "public_activity",
                "section": section_id,
                "ordinal": ordinal,
                "source_urls": source_urls,
                "article_urls": article_urls,
                "transcript_urls": transcript_urls,
                "download_urls": [],
                "video_urls": [],
                "transcript_status": "unassessed",
                "notes": {"card_description": description, "card_meta": meta},
                "warnings": [],
                "resource_ids": {"article": [], "transcript": [], "download": []},
            })
    return entries


def load_previous_entries(path: Path) -> tuple[dict[str, str], dict[str, dict[str, Any]]]:
    """Load the prior snapshot's article URL -> entry ID and metadata maps.

    The hub index is an ordered list, so ordinal-based IDs would change when
    a new card is inserted.  Canonical article URLs are the durable identity
    for an entry; the old snapshot remains untouched and is used only as an
    ID/metadata reference.
    """
    if not path.exists():
        return {}, {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, {}
    if not isinstance(value, list):
        return {}, {}
    by_url: dict[str, str] = {}
    by_id: dict[str, dict[str, Any]] = {}
    for old_entry in value:
        if not isinstance(old_entry, dict) or not old_entry.get("id"):
            continue
        old_id = str(old_entry["id"])
        by_id[old_id] = old_entry
        article_urls = old_entry.get("article_urls") or old_entry.get("source_urls") or []
        for url in article_urls:
            if not isinstance(url, str) or not url:
                continue
            by_url.setdefault(canonical_url(url), old_id)
    return by_url, by_id


def apply_stable_entry_ids(
    entries: list[dict[str, Any]],
    previous_entries_path: Path,
) -> dict[str, Any]:
    """Reuse prior IDs by canonical article URL and retain prior notes.

    Returns matching statistics for the coverage/diff report.  New IDs use the
    article URL hash rather than relying on the index ordinal.
    """
    previous_by_url, previous_by_id = load_previous_entries(previous_entries_path)
    matched_ids: list[str] = []
    new_ids: list[str] = []
    ambiguous_matches: list[dict[str, Any]] = []
    for entry in entries:
        article_urls = [canonical_url(url) for url in entry.get("article_urls", []) if url]
        old_ids = list(dict.fromkeys(previous_by_url[url] for url in article_urls if url in previous_by_url))
        if old_ids:
            entry["id"] = old_ids[0]
            matched_ids.append(entry["id"])
            if len(old_ids) > 1:
                ambiguous_matches.append({"article_urls": article_urls, "candidate_ids": old_ids})
            old_entry = previous_by_id.get(entry["id"], {})
            old_notes = old_entry.get("notes") or {}
            if isinstance(old_notes, dict):
                for key, value in old_notes.items():
                    if key not in entry["notes"]:
                        entry["notes"][key] = value
                    elif entry["notes"][key] != value and key in {"card_description", "card_meta"}:
                        entry["notes"][f"previous_{key}"] = value
            for warning in old_entry.get("warnings") or []:
                if warning not in entry["warnings"]:
                    entry["warnings"].append(warning)
            # Keep a prior URL relationship only when the current index no
            # longer exposes the same URL; this preserves provenance without
            # treating stale links as current downloadable resources.
            for field in ("source_urls", "article_urls", "transcript_urls", "download_urls"):
                prior = [canonical_url(url) for url in old_entry.get(field, []) if url]
                current = entry.get(field, [])
                if prior and set(prior) != set(current):
                    entry["notes"][f"previous_{field}"] = prior
            continue

        article_identity = "|".join(article_urls or [canonical_url(url) for url in entry.get("source_urls", [])])
        entry["id"] = f"entry-{entry['section']}-{short_hash(article_identity or entry['title'])}"
        new_ids.append(entry["id"])
    return {
        "previous_entries_path": str(previous_entries_path),
        "previous_entry_count": len(previous_by_id),
        "matched_entry_ids": matched_ids,
        "new_entry_ids": new_ids,
        "ambiguous_matches": ambiguous_matches,
    }


def write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def relative_to_snapshot(path: Path, snapshot_root: Path) -> str:
    return path.relative_to(snapshot_root).as_posix()


def extract_docx_markdown(data: bytes) -> str | None:
    """Extract UTF-8 paragraph text from a DOCX without decoding the ZIP bytes."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml_bytes = archive.read("word/document.xml")
        root = etree.fromstring(xml_bytes)
        paragraphs: list[str] = []
        for paragraph in root.xpath('.//*[local-name()="p"]'):
            parts = paragraph.xpath('.//*[local-name()="t"]/text()')
            value = "".join(parts).strip()
            if value:
                paragraphs.append(value)
        if not paragraphs:
            return None
        return "# 原始 Word 附件文字抽取\n\n" + "\n\n".join(paragraphs) + "\n"
    except (KeyError, OSError, ValueError, etree.XMLSyntaxError, zipfile.BadZipFile):
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index-url", default=INDEX_URL)
    parser.add_argument(
        "--root",
        type=Path,
        default=None,
        help="snapshot root for generated 訪談逐字稿/ output (defaults to this script's snapshot root)",
    )
    parser.add_argument(
        "--previous-entries",
        type=Path,
        default=None,
        help="prior entries.json used to preserve entry IDs and provenance notes",
    )
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument("--timeout", type=float, default=40.0)
    args = parser.parse_args()

    # Keep all writes below the explicitly assigned snapshot root.  The old
    # snapshot is read only as a stable-ID/provenance reference.
    script_path = Path(__file__).resolve()
    snapshot_root = (args.root or script_path.parents[1]).expanduser().resolve()
    output_root = snapshot_root / "訪談逐字稿"
    previous_entries_path = (
        args.previous_entries.expanduser().resolve()
        if args.previous_entries
        else script_path.parents[2] / "2026-11-06" / "訪談逐字稿" / "entries.json"
    )
    raw_html_root = output_root / "raw" / "html"
    raw_attachment_root = output_root / "raw" / "attachments"
    text_root = output_root / "text"
    for directory in (raw_html_root, raw_attachment_root, text_root):
        directory.mkdir(parents=True, exist_ok=True)

    fetcher = Fetcher(retries=args.retries, delay=args.delay, timeout=args.timeout)
    index_url = canonical_url(args.index_url)
    index_result = fetcher.fetch(index_url)
    if not index_result["bytes_data"]:
        print(f"ERROR: cannot fetch index: {index_result['error']}", file=sys.stderr)
        return 2
    try:
        index_root = parse_html(index_result["bytes_data"])
    except Exception as exc:
        print(f"ERROR: cannot parse index: {exc}", file=sys.stderr)
        return 2

    entries = card_entries(index_root)
    id_stats = apply_stable_entry_ids(entries, previous_entries_path)
    description = clean_text(" ".join(index_root.xpath('//meta[@name="description"]/@content')))
    claimed_match = re.search(r"(?:共|收錄)\s*(\d+)\s*個入口", description)
    claimed_count = int(claimed_match.group(1)) if claimed_match else None
    claimed_section_counts = {}
    for section_id in ("featured", "talks", "sessions"):
        section = index_root.xpath(f'//section[@id="{section_id}"]')
        claimed_section_counts[section_id] = len(section[0].xpath('.//article[contains(@class,"card")]')) if section else 0

    resources: dict[str, dict[str, Any]] = {}
    url_to_resource: dict[str, str] = {}

    def add_resource(
        kind: str,
        url: str,
        discovered_from: str | list[str],
        title_hint: str = "",
        owners: list[str] | None = None,
    ) -> str:
        url = canonical_url(url)
        rid = url_to_resource.get(url)
        incoming_sources = discovered_from if isinstance(discovered_from, list) else [discovered_from]
        incoming_owners = owners or []
        if rid:
            record = resources[rid]
            for source in incoming_sources:
                if source not in record["discovered_from"]:
                    record["discovered_from"].append(source)
            for owner in incoming_owners:
                if owner not in record["owners"]:
                    record["owners"].append(owner)
            return rid
        rid = resource_id(kind, url)
        resources[rid] = {
            "id": rid,
            "title": title_hint,
            "kind": kind,
            "source_url": url,
            "final_url": url,
            "retrieved_at": None,
            "status": "queued",
            "http_status": None,
            "content_type": None,
            "raw_path": None,
            "text_path": None,
            "sha256": None,
            "bytes": 0,
            "discovered_from": incoming_sources,
            "owners": incoming_owners,
            "notes": [],
            "video_urls": [],
            "warnings": [],
            "full_transcript_found": False,
            "transcript_evidence": [],
        }
        url_to_resource[url] = rid
        return rid

    index_id = add_resource("hub_index", index_url, "root", "PUMA HUB 索引")
    index_record = resources[index_id]
    index_record.update({
        "retrieved_at": now_iso(),
        "status": index_result["status"],
        "http_status": index_result["http_status"],
        "final_url": index_result["final_url"],
        "content_type": index_result["content_type"],
        "bytes": len(index_result["bytes_data"]),
        "sha256": hashlib.sha256(index_result["bytes_data"]).hexdigest(),
    })
    index_raw_path = raw_html_root / "hub-index.html"
    index_text_path = text_root / "hub-index.md"
    write_bytes(index_raw_path, index_result["bytes_data"])
    write_bytes(index_text_path, readable_markdown(index_root, index_result["final_url"]).encode("utf-8"))
    index_record["raw_path"] = relative_to_snapshot(index_raw_path, snapshot_root)
    index_record["text_path"] = relative_to_snapshot(index_text_path, snapshot_root)

    # Each card is one entry even when the same interview has multiple linked
    # pages.  This prevents article/transcript pages being counted as separate
    # interviews while preserving their one-to-many relationships.
    for entry in entries:
        for article_url in entry["article_urls"]:
            rid = add_resource("interview_article", article_url, entry["id"], entry["title"], [entry["id"]])
            entry["resource_ids"]["article"].append(rid)
        for transcript_url in entry["transcript_urls"]:
            rid = add_resource("transcript_page", transcript_url, entry["id"], entry["title"], [entry["id"]])
            entry["resource_ids"]["transcript"].append(rid)

    def attach_page_findings(record: dict[str, Any], root: Any, data: bytes) -> None:
        page_url = record["final_url"]
        transcript_links = discover_transcript_links(root, page_url)
        attachment_links = discover_attachments(root, page_url, record["kind"])
        video_links = extract_video_urls(data, root, page_url)
        record["page_transcript_links"] = transcript_links
        record["page_attachment_links"] = attachment_links
        record["video_urls"] = video_links
        record["warnings"] = extract_warnings(root)
        record["full_transcript_found"] = inline_transcript_present(root)
        record["transcript_evidence"] = ["inline_transcript_container"] if record["full_transcript_found"] else []
        if record["full_transcript_found"]:
            record["notes"].append("transcript-like text detected in the page, including collapsed/details content when present")
        for owner_id in record.get("owners", []):
            owner = next((e for e in entries if e["id"] == owner_id), None)
            if owner is None:
                continue
            for url in transcript_links:
                if url not in owner["transcript_urls"]:
                    owner["transcript_urls"].append(url)
                tr_id = add_resource("transcript_page", url, record["id"], owner["title"], [owner_id])
                if tr_id not in owner["resource_ids"]["transcript"]:
                    owner["resource_ids"]["transcript"].append(tr_id)
            for attachment in attachment_links:
                url = attachment["url"]
                if url not in owner["download_urls"]:
                    owner["download_urls"].append(url)
                dl_id = add_resource(attachment["kind"], url, record["id"], owner["title"], [owner_id])
                dl_record = resources[dl_id]
                dl_record.setdefault("attachment_labels", [])
                if attachment["label"] and attachment["label"] not in dl_record["attachment_labels"]:
                    dl_record["attachment_labels"].append(attachment["label"])
                dl_record["attachment_role"] = attachment["kind"]
                if dl_id not in owner["resource_ids"]["download"]:
                    owner["resource_ids"]["download"].append(dl_id)
            for url in video_links:
                if url not in owner["video_urls"]:
                    owner["video_urls"].append(url)
            for warning in record.get("warnings", []):
                if warning not in owner["warnings"]:
                    owner["warnings"].append(warning)

    def save_page_or_attachment(record: dict[str, Any], result: dict[str, Any]) -> None:
        data = result["bytes_data"]
        record.update({
            "retrieved_at": now_iso(),
            "status": result["status"],
            "http_status": result["http_status"],
            "final_url": result["final_url"],
            "content_type": result["content_type"],
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest() if data else None,
        })
        if result["error"]:
            record["notes"].append(result["error"])
        if not data:
            return
        is_html = "html" in (record["content_type"] or "").lower() or data.lstrip().lower().startswith((b"<!doctype html", b"<html"))
        if is_html:
            try:
                page_root = parse_html(data)
                record["title"] = record["title"] or extract_title(page_root, record["source_url"])
                raw_path = raw_html_root / f"{safe_filename(record['id'])}.html"
                text_path = text_root / f"{safe_filename(record['id'])}.md"
                write_bytes(raw_path, data)
                write_bytes(text_path, readable_markdown(page_root, record["final_url"]).encode("utf-8"))
                record["raw_path"] = relative_to_snapshot(raw_path, snapshot_root)
                record["text_path"] = relative_to_snapshot(text_path, snapshot_root)
                attach_page_findings(record, page_root, data)
            except Exception as exc:
                record["notes"].append(f"HTML parse error: {exc}")
            return
        suffix = url_path_suffix(record["final_url"]) or ".txt"
        raw_path = raw_attachment_root / f"{safe_filename(record['id'])}{suffix}"
        write_bytes(raw_path, data)
        record["raw_path"] = relative_to_snapshot(raw_path, snapshot_root)
        suffix_lower = suffix.lower()
        content_type = (record["content_type"] or "").lower()
        is_docx = suffix_lower == ".docx" or "wordprocessingml.document" in content_type
        is_text = suffix_lower in TEXT_EXTENSIONS or content_type.startswith("text/") or content_type.startswith(("application/json", "application/xml"))
        if is_docx:
            extracted = extract_docx_markdown(data)
            if extracted is not None:
                text_path = text_root / f"{safe_filename(record['id'])}.md"
                write_bytes(text_path, extracted.encode("utf-8"))
                record["text_path"] = relative_to_snapshot(text_path, snapshot_root)
                record["notes"].append("text_path is UTF-8 paragraph extraction from DOCX; raw_path preserves original DOCX bytes")
            else:
                record["text_path"] = None
                record["notes"].append("binary DOCX attachment preserved at raw_path; paragraph text extraction failed")
        elif is_text:
            text_path = text_root / f"{safe_filename(record['id'])}{suffix}"
            write_bytes(text_path, data)
            record["text_path"] = relative_to_snapshot(text_path, snapshot_root)
        else:
            record["text_path"] = None
            record["notes"].append("binary attachment preserved at raw_path; no text extraction performed")
        # Text/Word/subtitle attachments are retained byte-for-byte.  A
        # transcript attachment is evidence of a transcript only when it was
        # fetched successfully and is non-empty; article/source-note files do
        # not count toward transcript coverage.
        record["full_transcript_found"] = record.get("kind") == "transcript_attachment" and len(data) >= 200
        record["transcript_evidence"] = ["transcript_attachment_bytes"] if record["full_transcript_found"] else []
        if not (record["content_type"] or "").lower().startswith(("text/", "application/json", "application/xml")):
            record["notes"].append("attachment content type is not clearly text; bytes preserved without interpretation")

    # Process the queue until no article/transcript page adds another resource.
    queue = list(resources.keys())
    processed: set[str] = set()
    while queue:
        rid = queue.pop(0)
        if rid in processed or rid == index_id:
            continue
        processed.add(rid)
        record = resources[rid]
        result = fetcher.fetch(record["source_url"])
        save_page_or_attachment(record, result)
        for new_rid in resources:
            if new_rid not in processed and new_rid not in queue:
                queue.append(new_rid)

    # Resolve transcript status only after every linked resource has been
    # fetched, preserving distinctions between absent, inline and failed text.
    for entry in entries:
        resource_by_id = resources
        article_records = [resource_by_id[rid] for rid in entry["resource_ids"]["article"] if rid in resource_by_id]
        transcript_records = [resource_by_id[rid] for rid in entry["resource_ids"]["transcript"] if rid in resource_by_id]
        download_records = [resource_by_id[rid] for rid in entry["resource_ids"]["download"] if rid in resource_by_id]
        inline_found = any(r.get("kind") == "interview_article" and r.get("full_transcript_found") for r in article_records)
        page_found = any(r.get("kind") == "transcript_page" and r.get("status") == "ok" and r.get("full_transcript_found") for r in transcript_records)
        attachment_found = any(r.get("kind") == "transcript_attachment" and r.get("status") == "ok" and r.get("full_transcript_found") for r in download_records)
        failed_link = bool(transcript_records) and not page_found and not inline_found and not attachment_found
        if page_found:
            entry["transcript_status"] = "found_page"
        elif inline_found:
            entry["transcript_status"] = "found_inline"
        elif attachment_found:
            entry["transcript_status"] = "found_attachment"
        elif failed_link:
            entry["transcript_status"] = "linked_but_failed"
        elif any(r.get("kind") == "transcript_page" and r.get("status") == "ok" for r in transcript_records):
            entry["transcript_status"] = "linked_page_without_fulltext"
        elif any(r.get("status") != "ok" for r in article_records):
            entry["transcript_status"] = "article_fetch_failed"
        else:
            entry["transcript_status"] = "not_found"
        if entry["transcript_status"] == "not_found":
            entry["notes"]["transcript_note"] = "未確認獨立完整逐字稿；索引所列文章頁與可見長文已保存，未將影音轉錄。"
            if entry["title"].startswith("We Will Never Back Down"):
                entry["notes"]["transcript_note"] = "來源頁為分章訪談整理（多為第三人稱摘要）；未確認獨立完整逐字稿，來源長文已保存。"
            elif entry["title"].startswith("和而不同"):
                entry["notes"]["transcript_note"] = "來源頁為 14 章第一人稱長篇演說文章，頁尾標示依指定 Markdown 文章製作；未確認獨立完整逐字稿，來源長文已保存。"
        if any(r.get("status") != "ok" for r in transcript_records + download_records):
            entry["notes"]["fetch_note"] = "one or more linked transcript/download resources failed; see manifest"
        if inline_found:
            entry["notes"]["inline_transcript"] = True
        for key in ("source_urls", "article_urls", "transcript_urls", "download_urls", "video_urls"):
            entry[key] = list(dict.fromkeys(entry[key]))
        for key in entry["resource_ids"]:
            entry["resource_ids"][key] = list(dict.fromkeys(entry["resource_ids"][key]))

    manifest = list(resources.values())
    for record in manifest:
        record.pop("owners", None)
        record.setdefault("page_transcript_links", [])
        record.setdefault("page_attachment_links", [])
        record.setdefault("video_urls", [])
        record.setdefault("warnings", [])
        record["discovered_from"] = list(dict.fromkeys(record.get("discovered_from", [])))

    manifest_path = output_root / "manifest.json"
    entries_path = output_root / "entries.json"
    coverage_path = output_root / "coverage.json"
    write_bytes(manifest_path, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    write_bytes(entries_path, (json.dumps(entries, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

    status_counts = Counter((record["kind"], record["status"]) for record in manifest)
    kind_counts = Counter(record["kind"] for record in manifest)
    entry_status_counts = Counter(entry["transcript_status"] for entry in entries)
    failed_resources = [
        {
            "id": record["id"],
            "kind": record["kind"],
            "source_url": record["source_url"],
            "status": record["status"],
            "http_status": record["http_status"],
            "notes": record.get("notes", []),
        }
        for record in manifest
        if record["status"] != "ok"
    ]
    missing_transcripts = [
        {
            "id": entry["id"],
            "title": entry["title"],
            "article_urls": entry["article_urls"],
            "transcript_urls": entry["transcript_urls"],
            "status": entry["transcript_status"],
            "notes": entry["notes"],
        }
        for entry in entries
        if entry["transcript_status"] in {"not_found", "article_fetch_failed", "linked_but_failed", "linked_page_without_fulltext"}
    ]
    def kind_summary(kind: str) -> dict[str, int]:
        records = [r for r in manifest if r["kind"] == kind]
        return {
            "total": len(records),
            "success": sum(r["status"] == "ok" for r in records),
            "failed": sum(r["status"] != "ok" for r in records),
        }

    coverage = {
        "snapshot_date": SNAPSHOT_DATE,
        "timezone": TIMEZONE,
        "retrieved_at": now_iso(),
        "index_url": index_url,
        "previous_entries_path": str(previous_entries_path),
        "entry_id_migration": id_stats,
        "claimed_entries": claimed_count,
        "claimed_section_counts": claimed_section_counts,
        "actual_entries": len(entries),
        "actual_unique_article_urls": len({url for e in entries for url in e["article_urls"]}),
        "actual_unique_transcript_urls": len({url for e in entries for url in e["transcript_urls"]}),
        "actual_unique_download_urls": len({url for e in entries for url in e["download_urls"]}),
        "actual_unique_video_urls": len({url for e in entries for url in e["video_urls"]}),
        "resources_by_kind": dict(kind_counts),
        "resource_status_counts": {f"{kind}:{status}": count for (kind, status), count in sorted(status_counts.items())},
        "article_pages": kind_summary("interview_article"),
        "transcript_pages": kind_summary("transcript_page"),
        "transcript_attachments": kind_summary("transcript_attachment"),
        "article_attachments": kind_summary("article_attachment"),
        "source_notes_attachments": kind_summary("source_notes_attachment"),
        "other_text_attachments": kind_summary("text_attachment"),
        "entries_with_transcript": len(entries) - len(missing_transcripts),
        "transcript_status_counts": dict(entry_status_counts),
        "missing_or_failed_transcripts": missing_transcripts,
        "failed_resources": failed_resources,
        "limitations": [
            "Only the cards discovered in the hub's featured/talks/sessions sections were treated as entries; related-reading links were not recursively crawled.",
            "Video/audio/social URLs were recorded in entries.json and not downloaded.",
            "The hub's source warnings are retained verbatim in entries.json/manifest.json; no transcript was corrected against audiovisual media.",
            "Raw HTML and text attachments are authoritative; generated Markdown is a readability derivative.",
        ],
    }
    write_bytes(coverage_path, (json.dumps(coverage, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

    csv_path = output_root / "coverage.csv"
    csv_lines = ["id,title,section,kind,transcript_status,article_urls,transcript_urls,download_urls,video_urls"]
    for entry in entries:
        fields = [
            entry["id"], entry["title"], entry["section"], entry["kind"], entry["transcript_status"],
            " | ".join(entry["article_urls"]), " | ".join(entry["transcript_urls"]),
            " | ".join(entry["download_urls"]), " | ".join(entry["video_urls"]),
        ]
        csv_lines.append(",".join('"' + value.replace('"', '""') + '"' for value in fields))
    write_bytes(csv_path, ("\n".join(csv_lines) + "\n").encode("utf-8"))

    print(json.dumps({
        "actual_entries": len(entries),
        "article_pages": coverage["article_pages"],
        "transcript_pages": coverage["transcript_pages"],
        "transcript_attachments": coverage["transcript_attachments"],
        "entries_with_transcript": coverage["entries_with_transcript"],
        "missing_or_failed_transcripts": len(missing_transcripts),
        "failed_resources": len(failed_resources),
        "total_bytes": sum(record["bytes"] for record in manifest),
        "output_root": str(output_root),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
