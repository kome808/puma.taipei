import { getSearchTerms } from '../public/topics/topic-search.mjs';

// Pre-tokenize Chinese for SQLite FTS5 unicode61. This is deterministic text
// processing, shared by the offline index builder and the request handler.
export function ftsTerms(value) {
  const normalized = String(value ?? '').normalize('NFKC').replace(/臺/g, '台').toLowerCase();
  const terms = new Set(getSearchTerms(normalized));
  for (const run of normalized.match(/[\p{Script=Han}\d]{2,}/gu) ?? []) {
    for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
  }
  return [...terms].filter((term) => term.length > 1 && term.length <= 150);
}

export function ftsQuery(value) {
  return ftsTerms(value).slice(0, 100).map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ');
}
