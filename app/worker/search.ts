import type { Evidence, PolicySource } from '../shared/contracts';
import type { Env } from './types';

interface EvidenceRow {
  id: string; source_id: string; title: string; url: string; kind: PolicySource['kind'];
  text: string; section: string; verification: string; notes_json: string;
}

const SELECT = `SELECT p.id, p.source_id, p.text, p.section, s.title, s.url, s.kind, s.verification, s.notes_json FROM passages p JOIN sources s ON s.id=p.source_id`;
const STOP = new Set(['這個', '什麼', '怎麼', '如何', '可以', '有沒有', '政策', '沈伯洋', '有人', '一個', '大家', '還是', '想要', '相關', '地方', '是不是', '請問', '幫忙', '說明', '真的', '但是', '因為', '所以', '哪些', '有些', '原本', '一直', '其他', '選擇', '關心', '具體', '做法', '台北', '臺北', '支持']);
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/都更|都市更新|老屋|危老|換屋/, ['都更', '都市更新', '老屋']],
  [/都更.*(?:卡|停|其他)|(?:卡|停).*都更/, ['退場', '交換', '無限都更']],
  [/肌力|肌少|肌肉|銀髮|長輩|長者|老人/, ['肌力', '運動', '教練']],
  [/小孩|孩子|育兒|托育|幼兒/, ['托育', '育兒', '幼兒']],
  [/交通|行人|車禍|人行道/, ['交通', '行人', '道路']],
  [/運動|健身|球場|場館/, ['運動', '社區', '場館']],
];

function housingSupplyQuestion(query: string): boolean {
  return /都更|都市更新|換屋|房子|房源|住宅|社宅/.test(query)
    && /房|住宅|土地|宅|先蓋|先建/.test(query)
    && /一開始|第一批|最初|起步|起始|哪裡來|哪來|從哪|怎麼來|怎樣來|來源|取得|先蓋|先建/.test(query);
}

export function queryTerms(query: string): string[] {
  const normalized = query.normalize('NFKC').toLowerCase();
  const terms = new Set<string>();
  for (const item of new Intl.Segmenter('zh-TW', { granularity: 'word' }).segment(normalized)) {
    const word = item.segment.trim();
    if (item.isWordLike && word.length >= 2 && word.length <= 24 && !STOP.has(word)) terms.add(word);
  }
  for (const [pattern, synonyms] of SYNONYMS) if (pattern.test(normalized)) for (const term of synonyms) terms.add(term);
  if (housingSupplyQuestion(normalized)) {
    for (const term of ['房源', '土地', '公有地', '國有地', '先蓋', '新住宅']) terms.add(term);
  }
  // Segmented full terms lead; selected bigrams make compound terms searchable.
  for (const word of [...terms]) if (/^[\p{Script=Han}]+$/u.test(word) && word.length > 2) {
    for (let i = 0; i < word.length - 1; i++) if (!STOP.has(word.slice(i, i + 2))) terms.add(word.slice(i, i + 2));
  }
  return [...terms].slice(0, 36);
}

function toEvidence(row: EvidenceRow): Evidence {
  let notes: string[] = [];
  try { notes = JSON.parse(row.notes_json); } catch { /* Older snapshots may not have notes. */ }
  return { id: row.id, sourceId: row.source_id, title: row.title, url: row.url, kind: row.kind, text: row.text, section: row.section || '', verification: row.verification, notes };
}

function rankedAndDiverse(items: Evidence[], query: string): Evidence[] {
  const terms = queryTerms(query);
  const supplyQuestion = housingSupplyQuestion(query);
  const anchors: RegExp[] = [];
  if (/都更|都市更新|老屋|危老|換屋/.test(query)) anchors.push(/都更|都市更新|老屋|危老|換屋/);
  if (/肌力|肌少|肌肉|運動|健身|教練/.test(query)) anchors.push(/運動|肌力|肌肉|健身|教練/);
  if (/育兒|托育|幼兒|臨托/.test(query)) anchors.push(/托育|育兒|幼兒|臨托|親子/);
  const scored = items.map((item, rank) => {
    const body = `${item.title}\n${item.section}\n${item.text}`;
    const hits = terms.filter((term) => body.includes(term));
    const topical = !anchors.length || anchors.some((anchor) => anchor.test(item.text) || anchor.test(item.section));
    const fieldHits = hits.filter((term) => item.section.includes(term)).length;
    const focusedTerms = /^(?:都更|都市更新|肌力|肌少|教練|運動|健身|托育|育兒|交通|行人|退場|交換|無限都更)$/;
    let score = hits.reduce((sum, term) => sum + (focusedTerms.test(term) ? 6 : 2), 0) + fieldHits * 4 + (item.kind === 'official' ? 9 : 0) + 4 / (rank + 1);
    if (supplyQuestion) {
      score += ['房源', '土地', '公有地', '國有地', '市有地', '先蓋', '新住宅']
        .filter((term) => item.text.includes(term)).length * 12;
    }
    if (/都更.*(?:卡|停|其他)|(?:卡|停).*都更/.test(query) && /退場|交換|卡關|卡住|退出/.test(item.text)) score += 8;
    if (/肌力|肌少|教練/.test(query) && /教練|肌力|運動小巴/.test(item.text)) score += 5;
    if (/核心摘要|政策摘要|訪談摘要|提問|逐字稿閱讀/.test(item.section)) score -= 5;
    if (/核心摘要/.test(item.section) && item.kind === 'interview') score -= 15;
    return { item, score, hits: hits.length, topical };
  }).filter((item) => item.topical && item.hits > 0).sort((a, b) => b.score - a.score);
  const selected: Evidence[] = [];
  const perSource = new Map<string, number>();
  for (const { item } of scored) {
    if ((perSource.get(item.sourceId) || 0) >= 2) continue;
    if (selected.some((s) => s.id === item.id || s.text === item.text)) continue;
    selected.push(item);
    perSource.set(item.sourceId, (perSource.get(item.sourceId) || 0) + 1);
    if (selected.length === 8) break;
  }
  return selected;
}

function fuseRankings(managed: Evidence[], lexical: Evidence[]): Evidence[] {
  type RankedSource = { score: number; managedRank: number; passages: Map<string, { item: Evidence; score: number; managedRank: number }> };
  const sources = new Map<string, RankedSource>();
  // Fuse source ranks first: two matching paragraphs in the same document are
  // corroboration, not two unrelated results competing for the entire budget.
  for (const [listIndex, list] of [managed, lexical].entries()) {
    const seenSources = new Set<string>();
    const seenPassages = new Set<string>();
    for (const item of list) {
      if (seenPassages.has(item.id)) continue;
      seenPassages.add(item.id);
      const source = sources.get(item.sourceId) ?? { score: 0, managedRank: Infinity, passages: new Map() };
      if (!seenSources.has(item.sourceId)) {
        seenSources.add(item.sourceId);
        source.score += 1 / (60 + seenSources.size);
        if (listIndex === 0) source.managedRank = seenSources.size;
      }
      const passage = source.passages.get(item.id) ?? { item, score: 0, managedRank: Infinity };
      passage.score += 1 / (60 + seenPassages.size);
      if (listIndex === 0) passage.managedRank = seenPassages.size;
      source.passages.set(item.id, passage);
      sources.set(item.sourceId, source);
    }
  }
  const ranked = [...sources.values()]
    .sort((a, b) => b.score - a.score || a.managedRank - b.managedRank)
    .slice(0, 6)
    .map((source) => [...source.passages.values()]
      .sort((a, b) => b.score - a.score || a.managedRank - b.managedRank));
  const selected: Evidence[] = [];
  // Give each selected source a place before adding its second paragraph.
  for (const paragraphIndex of [0, 1]) {
    for (const source of ranked) {
      const item = source[paragraphIndex]?.item;
      if (item && !selected.some((e) => e.id === item.id || e.text === item.text)) selected.push(item);
      if (selected.length === 8) return selected;
    }
  }
  return selected;
}

async function keywordMatches(env: Env, query: string): Promise<Evidence[]> {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const match = terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ');
  const sql = `${SELECT} JOIN passage_fts f ON f.id=p.id WHERE passage_fts MATCH ? ORDER BY bm25(passage_fts) LIMIT 180`;
  const result = await env.DB.prepare(sql).bind(match).all<EvidenceRow>();
  return result.results.map(toEvidence);
}

export async function keywordSearch(env: Env, query: string): Promise<Evidence[]> {
  return rankedAndDiverse(await keywordMatches(env, query), query);
}

function matchingCharacters(passage: string, chunk: string): number {
  const original = passage.replace(/\s/g, '');
  if (!original) return 0;
  if (chunk.includes(original)) return original.length;
  // AI Search may start a chunk in the middle of a canonical paragraph.
  // Require substantial exact original text, rather than its opening alone.
  let matched = 0;
  for (let offset = 0; offset < original.length; offset += 48) {
    const probe = original.slice(offset, offset + 48);
    if (probe.length >= 24 && chunk.includes(probe)) matched += probe.length;
  }
  return matched >= Math.min(96, original.length) ? matched : 0;
}

export async function searchEvidence(env: Env, query: string) {
  const matches = await keywordMatches(env, query);
  const lexical = rankedAndDiverse(matches, query);
  if (env.AI_SEARCH) {
    try {
      const semantic = await env.AI_SEARCH.search({
        query,
        ai_search_options: { retrieval: { retrieval_type: 'hybrid', max_num_results: 10, match_threshold: 0.35, context_expansion: 1 }, query_rewrite: { enabled: false } },
      });
      const candidates: Evidence[] = [];
      for (const chunk of semantic.chunks || []) {
        const file = chunk.item.key.split('/').at(-1)?.replace(/\.md$/i, '');
        if (!file) continue;
        const rows = await env.DB.prepare(`${SELECT} WHERE s.id=? LIMIT 100`).bind(file).all<EvidenceRow>();
        // Cite the canonical original paragraph, not metadata or a generated summary.
        const text = chunk.text.replace(/\s/g, '');
        const best = rows.results.map((row) => ({ row, overlap: matchingCharacters(row.text, text) }))
          .filter(({ overlap }) => overlap > 0)
          .sort((a, b) => b.overlap - a.overlap);
        candidates.push(...best.slice(0, 2).map(({ row }) => toEvidence(row)));
      }
      if (candidates.length) return { evidence: fuseRankings(candidates, matches), method: 'ai-search' as const };
    } catch {
      // A genuine full-text search remains available during index refresh/outage.
    }
  }
  return { evidence: lexical, method: 'keyword' as const };
}

export function generationContext(evidence: Evidence[], query = ''): Evidence[] {
  const selected: Evidence[] = [];
  let chars = 0;
  // Reserve room for separate mechanisms explicitly requested by the question.
  // Otherwise several broad, highly ranked paragraphs can exhaust the budget
  // before a lower-ranked explanation of the second mechanism is reached.
  const facets: RegExp[] = [];
  if (housingSupplyQuestion(query)) facets.push(/公有地|國有地|市有地|先蓋|新住宅|房源/);
  if (/都更|都市更新|老屋|換屋/.test(query)) {
    if (/退場|卡住|卡關|停擺|其他選擇/.test(query)) facets.push(/退場|退出|紅黃牌/);
    if (/換屋|換房|交換|其他選擇/.test(query)) facets.push(/換屋|交換的平台|交換平台|一換一|蓋新房換舊房/);
  }
  const priority = facets.map((facet) => evidence.find((item) => facet.test(item.text))).filter((item): item is Evidence => Boolean(item));
  for (const item of [...priority, ...evidence]) {
    if (selected.some((original) => original.id === item.id)) continue;
    // Full paragraph boundaries from the corpus; never cut a sentence mid-context.
    if (chars + item.text.length > 3200) continue;
    selected.push(item);
    chars += item.text.length;
    if (selected.length >= 6) break;
  }
  return selected;
}

export async function corpusStats(env: Env) {
  const rows = await env.DB.prepare('SELECT key,value FROM corpus_meta').all<{ key: string; value: string }>();
  const values = Object.fromEntries(rows.results.map((row) => [row.key, row.value]));
  const version = values.version || '';
  // The version is dated by the imported source snapshot, never by deployment
  // time or the visitor's clock. Restyling the site must not imply newer data.
  const updatedAt = /^(\d{4}-\d{2}-\d{2})(?:-|$)/.exec(version)?.[1] || '';
  return { sources: Number(values.sources || 0), passages: Number(values.passages || 0), version, updatedAt };
}
