#!/usr/bin/env node

import { readFile, readdir, unlink, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../..');
const SNAPSHOT_DIRNAME = path.join('00_來源資料', '2026-11-06');
const VERSION = '2026-11-06-v1';

const OFFICIAL_KINDS = new Set(['policy_index', 'policy_detail', 'heart_axis', 'framework_page']);
const TRANSCRIPT_KINDS = new Set(['transcript_page', 'transcript_attachment']);
const ARTICLE_KINDS = new Set(['interview_article', 'article_attachment']);
const SECTION_ORDER = new Map([
  ['featured', 0],
  ['talks', 1],
  ['sessions', 2],
]);

const COMMON_WORDS = [
  '人工智慧', '都市更新', '城市外交', '公共安全', '公共空間', '社會福利', '社會住宅',
  '兒少保護', '親子同行卡', '運動驛站', '台北研究院', '跨局處', '跨黨派', '市民大道',
  '通學區', '班級人數', '營養午餐', '心理支持', '心理諮商', '特殊教育', '家庭教育',
  '公務人員', '青年基金', '青年政策', '文化徑', '山林徑', '都市微森林', '城市治理',
  '雙城論壇', '國際交流', '資訊安全', '認知作戰', '混合戰', '防詐教育', '防災',
  '都市生態學', '無限都更', '資料交換', '民防', '市政', '政策', '政見', '教育',
  '交通', '社福', '文化', '森林', '青年', '運動', '家庭', '公務員', '客家', '水域',
  '城市', '市民', '生活', '安全', '安心', '陪伴', '機會', '時間', '韌性', '台北',
  '臺北', '沈伯洋', '選戰', '訪談', '逐字稿', '摘要', '主持人', '候選人', '市長',
].sort((a, b) => Array.from(b).length - Array.from(a).length);

const HAN_RUN_RE = /\p{Script=Han}+/gu;
const WORD_RE = /[A-Za-z0-9]+(?:[._/-][A-Za-z0-9]+)*/g;
const URL_RE = /https?:\/\/[^\s)\]}>]+/g;

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function normalizeWhitespace(value) {
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeForDedup(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .toLowerCase();
}

function asciiSlug(value, fallback = 'source') {
  const slug = String(value)
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function isFileUrl(url) {
  return /\.(?:md|json|docx|txt|vtt|srt)(?:$|[?#])/i.test(String(url));
}

function isMediaUrl(url) {
  return /\.(?:png|jpe?g|gif|webp|svg|pdf)(?:$|[?#])/i.test(String(url)) || /\/files\//i.test(String(url));
}

function canonicalPublicUrl(urls, preferred = []) {
  const pool = unique([...preferred, ...urls]);
  return pool.find((url) => /^https?:\/\//i.test(url) && !isFileUrl(url) && !isMediaUrl(url))
    || pool.find((url) => /^https?:\/\//i.test(url))
    || '';
}

function extractUrls(value) {
  return unique(String(value).match(URL_RE) || []).map((url) => url.replace(/[.,;:!?]+$/u, ''));
}

function parsePublishedAt(entry, rows = []) {
  const fields = [
    ...(entry?.notes?.card_meta || []),
    ...(entry?.warnings || []),
    ...rows.slice(0, 2).map((row) => row.text || ''),
  ];
  const patterns = [
    /(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)/,
    /(20\d{2})年\s*([01]?\d)月\s*([0-3]?\d)日?/,
  ];
  for (const value of fields) {
    for (const pattern of patterns) {
      const match = String(value).match(pattern);
      if (!match) continue;
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

function isHeading(line) {
  return /^#{1,6}\s+/.test(line) || /^\*\*\s*[^*]+\s*\*\*$/.test(line);
}

function headingText(line) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMetadataLine(line, title) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^---+$/.test(trimmed) || trimmed === '### ---') return true;
  if (/^(?:來源網址|最終網址|抓取時間|來源類型)[^：:]{0,24}\s*[：:]/.test(trimmed)) return true;
  if (/^-\s*(?:來源網址|最終網址|抓取時間|來源類型)[^：:]{0,24}\s*[：:]/.test(trimmed)) return true;
  if (/^來源\s*[：:]/.test(trimmed)) return true;
  if (/^原始\s*(?:HTML|Markdown|Word|文字|檔案)/i.test(trimmed)) return true;
  if (/^(?:Facebook|LINE|X|Threads|複製連結|分享[.…]*|已複製)$/.test(trimmed)) return true;
  if (trimmed === 'POLICIES' || trimmed === '政見') return true;
  if (/^以\s*HEART\s*五個面向/.test(trimmed)) return true;
  if (title && normalizeForDedup(trimmed) === normalizeForDedup(title)) return true;
  return false;
}

function cleanInlineMarkdown(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?(?:p|div|span|section|article|header|footer|main|nav|figure|figcaption|ul|ol|li|table|tr|td|th)[^>]*>/gi, '')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*>\s?/, '')
    .trim();
}

function splitSpeakerTurns(value) {
  return String(value)
    .replace(/\s+\*\*(?=\[(?:\d{2}:)?\d{2}:\d{2}\])/g, '\n**')
    .replace(/\s+(?=\[(?:\d{2}:)?\d{2}:\d{2}\]\s*[^\n：:]{1,40}[：:])/g, '\n');
}

function transcriptBodyStart(lines) {
  const headings = lines.map((line, index) => {
    const match = line.match(/^(#{1,6})\s+/);
    return match ? { index, level: match[1].length, text: headingText(line) } : null;
  }).filter(Boolean);
  if (!headings.length) return 0;

  // The first heading is normally the source title.  A later, explicit
  // "complete transcript" heading is the safest boundary because summaries
  // and timeline notes before it are editorial material, not direct speech.
  const firstHeadingIndex = headings[0].index;
  const complete = headings.find(({ index, text }) => index !== firstHeadingIndex && (
    /(?:完整|全文|全程).*(?:逐字|對話|發言|原音|實錄|紀錄)/u.test(text)
    || /(?:逐字|對話|發言).*(?:全文|實錄|紀錄|內容)/u.test(text)
    || /講者發言逐字/u.test(text)
  ));
  if (complete) return complete.index;

  // Some pages have only an editorial outline followed by numbered chapter
  // headings.  Use a level-3 chapter as a conservative fallback; level-2
  // headings may be the first real dialogue section (for example, an opening).
  const chapter = headings.find(({ index, level, text }) => index !== firstHeadingIndex && level >= 3 && (
    /^(?:[一二三四五六七八九十百]+、|第\s*[一二三四五六七八九十百0-9]+\s*章|[0-9]+[.)])/u.test(text)
  ));
  return chapter ? chapter.index : 0;
}

export function cleanSourceText(rawText, { title = '', kind = '' } = {}) {
  const rawLines = splitSpeakerTurns(String(rawText || '').replace(/\r\n?/g, '\n')).split('\n');
  const cleaned = [];
  const seenContent = new Set();
  for (const rawLine of rawLines) {
    const line = cleanInlineMarkdown(rawLine);
    if (!line || isMetadataLine(line, title)) continue;
    if (/^#+\s*[-—–]+$/.test(line)) continue;
    if (/^\s*(?:目錄|目次|章節導覽)\s*$/u.test(line)) continue;
    const dedupKey = normalizeForDedup(line);
    if (dedupKey.length > 24 && seenContent.has(dedupKey)) continue;
    if (dedupKey.length > 24) seenContent.add(dedupKey);
    cleaned.push(line);
  }
  if (TRANSCRIPT_KINDS.has(kind)) {
    const start = transcriptBodyStart(cleaned);
    if (start > 0) cleaned.splice(0, start);
  }
  const text = normalizeWhitespace(cleaned.join('\n'));
  return text;
}

function sentenceUnits(value) {
  const units = [];
  for (const rawLine of String(value).split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const matches = line.match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [line];
    for (const match of matches) {
      const unit = match.trim();
      if (unit) units.push(unit);
    }
  }
  return units;
}

function splitOversizedUnit(unit, maxChars) {
  if (Array.from(unit).length <= maxChars) return [unit];
  const pieces = [];
  let rest = unit;
  while (Array.from(rest).length > maxChars) {
    const chars = Array.from(rest);
    let cut = Math.min(maxChars, chars.length);
    const lowerBound = Math.max(120, Math.floor(maxChars * 0.55));
    for (let i = cut; i >= lowerBound; i -= 1) {
      if (/[，,、：:]/u.test(chars[i - 1])) {
        cut = i;
        break;
      }
    }
    if (cut === maxChars && !/[，,、：:]/u.test(chars.slice(lowerBound, cut).join(''))) {
      const boundary = rest.lastIndexOf(' ', maxChars);
      if (boundary >= lowerBound) cut = boundary;
    }
    if (cut >= chars.length) break;
    const piece = chars.slice(0, cut).join('').trim();
    if (!piece) break;
    pieces.push(piece);
    rest = chars.slice(cut).join('').trim();
  }
  if (rest) pieces.push(rest);
  return pieces.length ? pieces : [unit];
}

const NON_SPEAKER_LABELS = new Set(['例如', '注意', '因此', '所以', '問題', '回答', '重點', '摘要', '結論', '說明', '內容', '時間', '日期', '來源', '備註', '受訪來賓', '主持群', '主要講者', '講者']);
const SPEAKER_ROLE_HINT = /主持|受訪|來賓|記者|委員|老師|教授|主席|市民|教練|專家|代表|總編|理事長|市長|參選人|議員|部長|總統|律師|醫師|導演|博士|Puma|Host|Guest/i;

function extractSpeakerLabel(value) {
  const line = String(value || '')
    .trim()
    .replace(/^(?:\\?\[[^\]]+\\?\]\s*|【[^】]+】\s*)/u, '')
    .replace(/^(?:🗣️|🎙️)\s*/u, '')
    .replace(/^(?:\*\*|__)/, '')
    .replace(/(?:\*\*|__)\s*$/, '');
  const match = line.match(/^([^：:\n]{1,40})\s*[：:]/u);
  if (!match) return null;
  const speaker = match[1].trim();
  if (!speaker || NON_SPEAKER_LABELS.has(speaker)) return null;
  if (/^(?:我|你|他|她|它|那|這|就|而|但|因|所|如|如果|因為|接下來|最|然後|此外|目前|今天|大家|我們|這個|這樣|曾|也|還|要|請|欸|嗯|再來|第一|第二|影片|節目|本集|本場|核心|訪談|專訪|主要|播出|長度|網址|原稿|完整|清單|主題|章節)/u.test(speaker)) return null;
  if (/[，。！？；、「」『』=\/?&#<>{}'"]/u.test(speaker)) return null;
  if (speaker.includes('[') || speaker.includes(']') || speaker.includes('\\')) return null;
  if (/^[\d\p{P}\p{S}]/u.test(speaker)) return null;
  if (/(?:問題|陣容|目錄|導覽|摘要|影片|來源|內容|主題|章節|原稿)$/u.test(speaker)) return null;
  if (Array.from(speaker).length > 8 && !SPEAKER_ROLE_HINT.test(speaker)) return null;
  return speaker;
}

function sectionWithInheritedSpeaker(section, speaker) {
  return speaker ? `${section}｜接續語者：${speaker}` : section;
}

export function segmentText(cleanText, { title = '來源', minChars = 450, maxChars = 900, trackSpeaker = false } = {}) {
  const lines = String(cleanText || '').split('\n');
  const blocks = [];
  let section = title;
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const value = paragraph.join('\n').trim();
    if (value) blocks.push({ section, text: value });
    paragraph = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (isHeading(trimmed)) {
      flushParagraph();
      section = headingText(trimmed) || section;
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();

  const passages = [];
  let current = null;
  let activeSection = title;
  let activeSpeaker = null;
  const flushCurrent = () => {
    if (!current) return;
    const text = current.text.trim();
    if (text) passages.push({ section: trackSpeaker ? sectionWithInheritedSpeaker(current.section, current.inheritedSpeaker) : current.section, text });
    current = null;
  };
  for (const block of blocks) {
    if (activeSection !== block.section) {
      flushCurrent();
      activeSection = block.section;
      if (trackSpeaker) activeSpeaker = null;
    }
    for (const rawUnit of sentenceUnits(block.text)) {
      const explicitSpeaker = trackSpeaker ? extractSpeakerLabel(rawUnit) : null;
      if (explicitSpeaker) activeSpeaker = explicitSpeaker;
      const pieces = splitOversizedUnit(rawUnit, maxChars);
      for (const [pieceIndex, unit] of pieces.entries()) {
        const startsWithSpeaker = pieceIndex === 0 && Boolean(explicitSpeaker);
        const size = Array.from(unit).length;
        if (!current) current = { section: block.section, text: unit, inheritedSpeaker: startsWithSpeaker ? null : activeSpeaker };
        else if (Array.from(current.text).length + 1 + size <= maxChars) current.text += `\n${unit}`;
        else {
          flushCurrent();
          current = { section: block.section, text: unit, inheritedSpeaker: startsWithSpeaker ? null : activeSpeaker };
        }
        void minChars;
      }
    }
  }
  flushCurrent();
  return passages;
}

function lexicalTokensFromHanRun(run) {
  const chars = Array.from(run);
  const tokens = [];
  let index = 0;
  while (index < chars.length) {
    const match = COMMON_WORDS.find((word) => chars.slice(index, index + Array.from(word).length).join('') === word);
    if (match) {
      tokens.push(match);
      index += Array.from(match).length;
    } else {
      tokens.push(chars[index]);
      index += 1;
    }
  }
  for (let i = 0; i < chars.length - 1; i += 1) tokens.push(`${chars[i]}${chars[i + 1]}`);
  return tokens;
}

export function buildTokens(text) {
  const tokens = [];
  const value = String(text || '').normalize('NFKC');
  for (const run of value.match(HAN_RUN_RE) || []) tokens.push(...lexicalTokensFromHanRun(run));
  for (const match of value.matchAll(WORD_RE)) tokens.push(match[0].toLowerCase());
  return unique(tokens.filter((token) => token && !/[，。！？；、：？！]/u.test(token))).join(' ');
}

function textPathExtension(row) {
  return path.extname(String(row.text_path || row.raw_path || '')).toLowerCase();
}

function usableCandidate(row) {
  if (!row?.text || !String(row.text).trim()) return false;
  if (textPathExtension(row) === '.json') return false;
  return TRANSCRIPT_KINDS.has(row.kind) || ARTICLE_KINDS.has(row.kind);
}

function recordKey(row) {
  const id = String(row.id || '');
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

function rowSortKey(row) {
  return `${row.kind || ''}\u0000${row.id || ''}`;
}

function candidateScore(row, cleanedText) {
  const family = TRANSCRIPT_KINDS.has(row.kind) ? 2 : 1;
  const length = Array.from(cleanedText).length;
  return [family, length, row.kind === 'transcript_attachment' ? 1 : 0, rowSortKey(row)];
}

function compareScores(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return String(a[3]).localeCompare(String(b[3]));
}

export function selectCanonical(entry, rows) {
  const candidates = rows
    .filter(usableCandidate)
    .map((row) => ({ row, cleanText: cleanSourceText(row.text, { title: entry.title, kind: row.kind }) }))
    .filter(({ cleanText }) => cleanText.length > 0);
  const transcripts = candidates.filter(({ row }) => TRANSCRIPT_KINDS.has(row.kind));
  const pool = transcripts.length ? transcripts : candidates.filter(({ row }) => ARTICLE_KINDS.has(row.kind));
  if (!pool.length) return null;
  pool.sort((a, b) => compareScores(candidateScore(a.row, a.cleanText), candidateScore(b.row, b.cleanText)));
  return {
    row: pool[0].row,
    cleanText: pool[0].cleanText,
    candidates: candidates.map(({ row }) => row),
    discarded: candidates.filter(({ row }) => row.id !== pool[0].row.id).map(({ row }) => row),
  };
}

function sourceNotes({ entry, selected, official = false }) {
  if (official) return ['官方政策／框架原文已保存；本語料未進行政策事實查核。'];
  const notes = [
    '逐字稿未逐句與影音核對，引用前請對照原始影音。',
    '訪談摘要／整理文章與逐字稿是不同內容版本，不能互相視為逐字引文。',
  ];
  for (const warning of entry.warnings || []) {
    const clean = normalizeWhitespace(warning);
    if (clean && !notes.includes(clean)) notes.push(clean);
  }
  if (selected?.row?.kind === 'interview_article' || selected?.row?.kind === 'article_attachment') {
    notes.push('本入口以文章／整理稿作為可用全文；入口未提供可用逐字稿或本次未選用逐字稿。');
  } else {
    notes.push('本入口以可用逐字稿版本為主；同場文章與附件已去重並列為關聯來源。');
  }
  return unique(notes);
}

function relatedUrlsForEntry(entry, selected) {
  const candidateUrls = [
    ...(entry.source_urls || []),
    ...(entry.article_urls || []),
    ...(entry.transcript_urls || []),
    ...(entry.download_urls || []),
    ...(entry.video_urls || []),
    selected?.resourceUrl || '',
  ];
  const selectedUrl = selected?.url || '';
  return unique(candidateUrls).filter((url) => url !== selectedUrl);
}

function sourceIdFrom(value) {
  return `src-${asciiSlug(value, 'source')}`;
}

function makeSourceIdSet(sources) {
  const seen = new Set();
  for (const source of sources) {
    let id = source.id;
    let index = 2;
    while (seen.has(id)) id = `${source.id}-${index++}`;
    source.id = id;
    seen.add(id);
  }
  return seen;
}

function officialSource(row) {
  const id = sourceIdFrom(recordKey(row));
  const cleanText = cleanSourceText(row.text, { title: row.title, kind: row.kind });
  const sourceKind = row.kind === 'heart_axis' || row.kind === 'framework_page' ? 'framework' : 'official';
  const related = extractUrls(row.text || '').filter((url) => url !== row.source_url && !isMediaUrl(url) && !isFileUrl(url));
  return {
    source: {
      id,
      title: row.title || recordKey(row),
      url: canonicalPublicUrl([row.source_url]),
      kind: sourceKind,
      publishedAt: null,
      retrievedAt: row.retrieved_at || '2026-11-06T00:00:00+00:00',
      groupId: `official-${asciiSlug(recordKey(row))}`,
      verification: '原始官方頁面已下載；內容未進行獨立政策事實查核。',
      notes: sourceNotes({ official: true }),
      relatedUrls: related,
    },
    cleanText,
    selectedKind: row.kind,
    selectedRecordId: row.id,
    discarded: [],
  };
}

function interviewSource(entry, selectedInfo) {
  const selectedRow = selectedInfo.row;
  const isTranscript = TRANSCRIPT_KINDS.has(selectedRow.kind);
  const preferred = isTranscript ? entry.transcript_urls || [] : entry.article_urls || [];
  const sourceUrl = canonicalPublicUrl(entry.source_urls || [], preferred);
  const source = {
    id: sourceIdFrom(entry.id),
    title: entry.title,
    url: sourceUrl,
    kind: isTranscript ? 'interview' : 'article',
    publishedAt: parsePublishedAt(entry, [selectedRow]),
    retrievedAt: selectedRow.retrieved_at || '2026-11-06T00:00:00+00:00',
    groupId: entry.id,
    verification: '來源頁／原稿已保存；逐字稿未逐句與影音核對，訪談摘要與逐字內容需分開辨識。',
    notes: sourceNotes({ entry, selected: selectedInfo }),
    relatedUrls: relatedUrlsForEntry(entry, { url: sourceUrl, resourceUrl: selectedRow.source_url }),
  };
  return {
    source,
    cleanText: selectedInfo.cleanText,
    selectedKind: selectedRow.kind,
    selectedRecordId: selectedRow.id,
    discarded: selectedInfo.discarded,
  };
}

function makePassages(sourceId, cleanText, title, sourceKind) {
  return segmentText(cleanText, { title, trackSpeaker: sourceKind === 'interview' }).map((passage, index) => ({
    id: `${sourceId}-p${String(index + 1).padStart(4, '0')}`,
    sourceId,
    text: passage.text,
    section: passage.section || title,
    tokens: buildTokens(passage.text),
  }));
}

function sqlValue(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function makeSchemaSql() {
  return `-- Generated by app/scripts/build-corpus.mjs; do not edit by hand.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL,
  published_at TEXT,
  retrieved_at TEXT NOT NULL,
  group_id TEXT NOT NULL,
  verification TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  related_urls_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS passages (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  section TEXT NOT NULL,
  tokens TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS passage_fts USING fts5(
  id UNINDEXED,
  tokens
);

CREATE TABLE IF NOT EXISTS corpus_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS passages_source_id_idx ON passages(source_id);
`;
}

function makeDataSql(corpus, stats) {
  const lines = [
    '-- Generated by app/scripts/build-corpus.mjs; safe to run repeatedly.',
    'BEGIN;',
    '',
    'INSERT INTO corpus_meta (key, value) VALUES',
    `  ('version', ${sqlValue(corpus.version)}),`,
    `  ('sources', ${sqlValue(corpus.sources.length)}),`,
    `  ('passages', ${sqlValue(corpus.passages.length)}),`,
    `  ('logical_entries', ${sqlValue(stats.logicalEntries)}),`,
    `  ('generated_from', ${sqlValue('00_來源資料/2026-11-06/全文資料.jsonl')})`,
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    '',
  ];
  for (const source of corpus.sources) {
    lines.push(
      'INSERT INTO sources (id, title, url, kind, published_at, retrieved_at, group_id, verification, notes_json, related_urls_json) VALUES',
      `  (${[
        source.id,
        source.title,
        source.url,
        source.kind,
        source.publishedAt,
        source.retrievedAt,
        source.groupId,
        source.verification,
        JSON.stringify(source.notes),
        JSON.stringify(source.relatedUrls),
      ].map(sqlValue).join(', ')} )`,
      'ON CONFLICT(id) DO UPDATE SET',
      '  title = excluded.title, url = excluded.url, kind = excluded.kind,',
      '  published_at = excluded.published_at, retrieved_at = excluded.retrieved_at,',
      '  group_id = excluded.group_id, verification = excluded.verification,',
      '  notes_json = excluded.notes_json, related_urls_json = excluded.related_urls_json;',
      '',
    );
  }
  for (const passage of corpus.passages) {
    lines.push(
      'INSERT INTO passages (id, source_id, text, section, tokens) VALUES',
      `  (${[passage.id, passage.sourceId, passage.text, passage.section, passage.tokens].map(sqlValue).join(', ')} )`,
      'ON CONFLICT(id) DO UPDATE SET',
      '  source_id = excluded.source_id, text = excluded.text, section = excluded.section, tokens = excluded.tokens;',
      '',
    );
  }
  lines.push(
    'DELETE FROM passage_fts;',
    'INSERT INTO passage_fts (id, tokens) SELECT id, tokens FROM passages;',
    'COMMIT;',
    '',
  );
  return lines.join('\n');
}

function makeSearchDocument(source, passages) {
  const lines = [
    '---',
    `source_id: ${source.id}`,
    `title: ${JSON.stringify(source.title)}`,
    `url: ${source.url}`,
    `kind: ${source.kind}`,
    `group_id: ${source.groupId}`,
    `published_at: ${source.publishedAt || ''}`,
    '---',
    '',
    `# ${source.title}`,
    '',
    `來源網址：${source.url}`,
    `來源類型：${source.kind}`,
    `查核狀態：${source.verification}`,
    '',
  ];
  if (source.notes.length) lines.push('## 來源備註', '', ...source.notes.map((note) => `- ${note}`), '');
  let lastSection = '';
  for (const passage of passages) {
    if (passage.section !== lastSection) {
      lines.push(`## ${passage.section}`, '');
      lastSection = passage.section;
    }
    lines.push(passage.text, '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function makeReport(stats) {
  const kindRows = Object.entries(stats.selectedByKind).map(([kind, count]) => `| ${kind} | ${count} |`);
  const hostRows = Object.entries(stats.sourceHosts || {}).map(([host, count]) => `| ${host} | ${count} |`);
  const excludedRows = Object.entries(stats.excludedByReason).map(([reason, count]) => `| ${reason} | ${count} |`);
  const selectedRows = Object.entries(stats.selectionByEntryStatus).map(([status, count]) => `| ${status} | ${count} |`);
  const longPassages = stats.passageLengths.filter((value) => value > 900).length;
  const shortPassages = stats.passageLengths.filter((value) => value < 450).length;
  return `# 語料建置報告：${VERSION}

本報告由 app/scripts/build-corpus.mjs 依 2026-11-06 來源快照產生；原始快照未修改。

## 收錄數量

| 項目 | 數量 |
|---|---:|
| 全文輸入紀錄 | ${stats.inputTextRecords} |
| 官方政策／框架來源 | ${stats.officialSources} |
| 邏輯訪談／活動入口（以 entries.json 為準） | ${stats.logicalEntries} |
| 語料來源（canonical sources） | ${stats.sourceCount} |
| 語料段落 | ${stats.passageCount} |
| 語料字元（Unicode code points） | ${stats.totalChars} |

## Canonical 選擇

每個 entries.json 入口只建立一個 interview source。若有可用逐字稿，優先在逐字稿頁／附件中選取清理後最長版本；沒有可用逐字稿時，選取文章／長文版本。文章、逐字稿與附件的其他版本只保留為 related URL 或選擇統計，不重複建立來源。

| 選用來源 kind | 數量 |
|---|---:|
${kindRows.join('\n')}

| 入口 transcript_status | 數量 |
|---|---:|
${selectedRows.join('\n')}

## 排除與去重

| 排除原因 | 紀錄數 |
|---|---:|
${excludedRows.join('\n')}

以上是不同判定口徑的報告統計，可能同一紀錄同時落在候選版本去重與 canonical 排除分類；各列不可相加回推全文輸入紀錄總數。

未選用的文章／逐字稿附件不代表內容不存在；它們是同一個邏輯入口的重複版本。官方圖片與 PDF 未在文字快照中 OCR／抽取，因此不會出現在此語料。

## 分段與搜尋

段落以 Markdown 章節、空行、講者／時間碼及句末標點為邊界，目標約 450–900 個 Unicode 字元；不為湊長度切斷完整句子。此次共有 ${shortPassages} 段低於 450 字（多為短來源或章節邊界），${longPassages} 段超過 900 字（長句或原稿無安全句界）。
Chinese tokens 同時保留詞典式多字詞、單字 fallback 與相鄰雙字 bigram，並以空白分隔供 D1 FTS5 使用。

## 限制與查核狀態

- 全部原始文字紀錄的快照狀態是「已下載、未事實查核」；本語料不把候選人／來賓的說法轉成已證實事實。
- 訪談逐字稿沒有逐句與影音核對；自動辨識錯字、缺句、時間碼與講者標示疑點依來源備註保留。
- 訪談摘要／整理文章與逐字稿是不同內容版本；引用時需標示是摘要、整理或逐字稿，不能把摘要當成逐字引文。
- PDF、圖片及其他二進位附件沒有 OCR／全文抽取，故未納入 passage；其原始連結可留在來源快照中。
- 來源 URL 使用原始公開政策頁或原始 hub 文章／逐字稿頁；下載用的 .md、.json、.docx 不作 canonical source URL。
- 本快照也包含其他原始公開訪談站的來源頁；canonical URL 未改寫成不存在的 hub 替代網址。主機分布如下：

| canonical URL host | 來源數 |
|---|---:|
${hostRows.join('\n')}

- 本輸出是 server-side corpus；corpus.json、D1 SQL 與搜尋 Markdown 不包含任何 API 金鑰或秘密。
`;
}

async function readJsonLines(filePath) {
  const value = await readFile(filePath, 'utf8');
  return value.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function normalizeProjectRoot(projectRoot) {
  const raw = projectRoot instanceof URL ? fileURLToPath(projectRoot) : String(projectRoot || DEFAULT_PROJECT_ROOT);
  return decodeURIComponent(raw);
}

export async function buildCorpusFromSnapshot(projectRoot = DEFAULT_PROJECT_ROOT) {
  const root = normalizeProjectRoot(projectRoot);
  const snapshotDir = path.join(root, SNAPSHOT_DIRNAME);
  const rows = await readJsonLines(path.join(snapshotDir, '全文資料.jsonl'));
  const entries = JSON.parse(await readFile(path.join(snapshotDir, '訪談逐字稿', 'entries.json'), 'utf8'));
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.id, row);
    byId.set(recordKey(row), row);
  }

  const official = rows.filter((row) => row.source_group === '官方政策' && OFFICIAL_KINDS.has(row.kind));
  const sources = [];
  const selectedTexts = new Map();
  const stats = {
    inputTextRecords: rows.length,
    officialRecords: official.length,
    officialSources: 0,
    logicalEntries: entries.length,
    sourceCount: 0,
    passageCount: 0,
    totalChars: 0,
    selectedByKind: {},
    selectionByEntryStatus: {},
    excludedByReason: {},
    passageLengths: [],
    selectedRecordIds: [],
  };

  for (const row of official) {
    const result = officialSource(row);
    if (!result.cleanText) {
      stats.excludedByReason.emptyOfficialText = (stats.excludedByReason.emptyOfficialText || 0) + 1;
      continue;
    }
    sources.push(result.source);
    selectedTexts.set(result.source.id, { text: result.cleanText, title: result.source.title });
    stats.officialSources += 1;
    stats.selectedByKind[row.kind] = (stats.selectedByKind[row.kind] || 0) + 1;
    stats.selectedRecordIds.push(row.id);
  }

  const orderedEntries = [...entries].sort((a, b) => {
    const section = (SECTION_ORDER.get(a.section) ?? 99) - (SECTION_ORDER.get(b.section) ?? 99);
    return section || Number(a.ordinal || 0) - Number(b.ordinal || 0) || String(a.id).localeCompare(String(b.id));
  });
  const linkedRecordIds = new Set();
  const selectedRecordIdSet = new Set(stats.selectedRecordIds);
  for (const entry of orderedEntries) {
    const resourceIds = Object.values(entry.resource_ids || {}).flat();
    const candidateRows = resourceIds.map((id) => byId.get(id)).filter(Boolean);
    for (const row of candidateRows) linkedRecordIds.add(row.id);
    const selected = selectCanonical(entry, candidateRows);
    const status = entry.transcript_status || 'unknown';
    stats.selectionByEntryStatus[status] = (stats.selectionByEntryStatus[status] || 0) + 1;
    if (!selected) {
      stats.excludedByReason.noUsableInterviewText = (stats.excludedByReason.noUsableInterviewText || 0) + 1;
      continue;
    }
    const result = interviewSource(entry, selected);
    sources.push(result.source);
    selectedTexts.set(result.source.id, { text: result.cleanText, title: result.source.title });
    selectedRecordIdSet.add(result.selectedRecordId);
    stats.selectedRecordIds.push(result.selectedRecordId);
    stats.selectedByKind[result.selectedKind] = (stats.selectedByKind[result.selectedKind] || 0) + 1;
    for (const row of result.discarded) {
      stats.excludedByReason.duplicateArticleTranscriptAttachment = (stats.excludedByReason.duplicateArticleTranscriptAttachment || 0) + 1;
      if (row.kind === 'source_notes_attachment') {
        stats.excludedByReason.sourceNotes = (stats.excludedByReason.sourceNotes || 0) + 1;
      }
    }
  }

  makeSourceIdSet(sources);
  const textBySource = new Map();
  for (const source of sources) {
    const old = selectedTexts.get(source.id) || selectedTexts.get(source.id.replace(/-\d+$/, ''));
    if (old) textBySource.set(source.id, old);
  }
  const passages = [];
  for (const source of sources) {
    const selected = textBySource.get(source.id);
    if (!selected) continue;
    for (const passage of makePassages(source.id, selected.text, selected.title, source.kind)) {
      passages.push(passage);
      const size = Array.from(passage.text).length;
      stats.passageLengths.push(size);
      stats.totalChars += size;
    }
  }

  const linked = rows.filter((row) => linkedRecordIds.has(row.id));
  const excludedNonCanonical = rows.filter((row) => !selectedRecordIdSet.has(row.id));
  stats.excludedByReason.nonCanonicalTextRecords = excludedNonCanonical.length;
  stats.excludedByReason.unlinkedOrIndexRecords = rows.length - linked.length - official.length;
  stats.sourceCount = sources.length;
  stats.passageCount = passages.length;
  stats.sourceHosts = {};
  for (const source of sources) {
    try {
      const host = new URL(source.url).hostname;
      stats.sourceHosts[host] = (stats.sourceHosts[host] || 0) + 1;
    } catch {
      stats.sourceHosts['(invalid or missing)'] = (stats.sourceHosts['(invalid or missing)'] || 0) + 1;
    }
  }
  const corpus = { version: VERSION, sources, passages };
  const sql = { schema: makeSchemaSql(), data: makeDataSql(corpus, stats) };
  const searchDocs = new Map();
  for (const source of sources) {
    searchDocs.set(source.id, makeSearchDocument(source, passages.filter((passage) => passage.sourceId === source.id)));
  }
  const report = makeReport(stats);
  return { corpus, sql, searchDocs, report, stats };
}

async function writeGenerated(projectRoot, result) {
  const appDir = path.join(projectRoot, 'app');
  const generatedDir = path.join(appDir, 'generated');
  const searchDocsDir = path.join(generatedDir, 'search-docs');
  const docsDir = path.join(appDir, 'docs');
  await mkdir(searchDocsDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });
  await writeFile(path.join(generatedDir, 'corpus.json'), `${JSON.stringify(result.corpus, null, 2)}\n`, 'utf8');
  await writeFile(path.join(generatedDir, 'schema.sql'), result.sql.schema, 'utf8');
  await writeFile(path.join(generatedDir, 'data.sql'), result.sql.data, 'utf8');
  for (const name of await readdir(searchDocsDir)) {
    if (name.endsWith('.md')) await unlink(path.join(searchDocsDir, name));
  }
  for (const [sourceId, document] of result.searchDocs) {
    await writeFile(path.join(searchDocsDir, `${sourceId}.md`), document, 'utf8');
  }
  await writeFile(path.join(docsDir, 'corpus-report.md'), result.report, 'utf8');
}

export async function main(projectRoot = DEFAULT_PROJECT_ROOT) {
  const root = normalizeProjectRoot(projectRoot);
  const result = await buildCorpusFromSnapshot(root);
  await writeGenerated(root, result);
  console.log(JSON.stringify({
    version: result.corpus.version,
    sources: result.corpus.sources.length,
    passages: result.corpus.passages.length,
    selectedByKind: result.stats.selectedByKind,
    output: path.join(root, 'app', 'generated'),
  }, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
