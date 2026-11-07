const STOPWORDS = new Set(["如何", "怎麼", "怎樣", "哪些", "可以", "要", "嗎", "呢", "和", "與", "的", "了", "在", "有", "是", "從", "到", "把", "讓", "為", "以及", "哪些", "什麼", "一開始"]);

// Small, corpus-grounded bridges for common wording that differs from the policy titles.
const SYNONYM_GROUPS = [
  ["臨時托育", "臨托", "臨時照顧", "沒人帶小孩", "沒人幫忙帶小孩", "臨時沒人帶小孩", "喘息"],
  ["肌力", "肌肉流失", "肌肉減少", "肌少症", "銀髮族肌肉", "長者肌力", "健身小巴", "體能教練"],
  ["無限都更", "循環都更", "都更房源", "第一批房源", "中繼宅"],
  ["老師", "教師"]
];

const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/臺/g, "台").toLocaleLowerCase("zh-TW");

function tokenize(value) {
  const text = normalize(value).replace(/[’‘`]/g, "'");
  let pieces;
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    pieces = [...new Intl.Segmenter("zh-TW", { granularity: "word" }).segment(text)]
      .filter((part) => part.isWordLike).map((part) => part.segment);
    // Some ICU builds split Chinese into single characters; retain adjacent bigrams too.
    for (const run of text.match(/[\u3400-\u9fff]{2,}/g) ?? []) {
      for (let i = 0; i < run.length - 1; i++) pieces.push(run.slice(i, i + 2));
    }
  } else {
    pieces = text.match(/[a-z0-9]+|[\u3400-\u9fff]+/g) ?? [];
    // Fallback keeps Chinese partial matches possible without an external tokenizer.
    pieces = pieces.flatMap((piece) => /[\u3400-\u9fff]/.test(piece) && piece.length > 2
      ? [piece, ...Array.from({ length: piece.length - 1 }, (_, i) => piece.slice(i, i + 2))]
      : [piece]);
  }
  return [...new Set(pieces.map((piece) => piece.trim()).filter((piece) => piece.length > 1 && !STOPWORDS.has(piece)))];
}

function expand(tokens, queryText) {
  const expanded = new Set(tokens);
  for (const group of SYNONYM_GROUPS) {
    const normalized = group.map(normalize);
    if (normalized.some((phrase) => phrase.length >= 2 && queryText.includes(phrase))) {
      // Keep aliases as phrases: splitting them creates generic bridges such as
      // 「教練」 or 「減少」 that can pull unrelated topics into the result set.
      for (const phrase of normalized) expanded.add(phrase);
    }
  }
  return [...expanded];
}

function fields(topic) {
  return {
    title: normalize(topic.title),
    question: normalize(topic.question),
    keywords: normalize((topic.keywords ?? []).join(" ")),
    intro: normalize(topic.intro),
    body: normalize([topic.share?.body, topic.share?.text, ...(topic.official ?? []).map((x) => x.text), ...(topic.interview ?? []).map((x) => x.text)].filter(Boolean).join(" "))
  };
}

function scoreTopic(topic, queryTokens, queryText) {
  const f = fields(topic);
  const weights = { title: 9, question: 5, keywords: 6, intro: 2, body: 0.65 };
  let score = 0;
  for (const token of queryTokens) {
    let best = 0;
    for (const [name, value] of Object.entries(f)) {
      if (!value) continue;
      const w = weights[name];
      if (value.includes(token)) best = Math.max(best, w * (name === "title" ? 1 : 0.82));
    }
    if (f.title.includes(token)) best += 4;
    score += best;
  }
  // Exact phrase is strong evidence, but natural questions can still match by meaningful terms.
  if (queryText.length >= 3 && f.title.includes(queryText)) score += 12;
  if (queryText.includes("ai教練") && f.keywords.split(/\s+/).includes("ai教練")) score += 12;
  return score;
}

/** Return original topic records ordered by lexical relevance; never edits or generates topic content. */
export function searchTopics(topics, query) {
  const input = Array.isArray(topics) ? topics : [];
  const normalized = normalize(query).replace(/[\p{P}\p{S}\s]+/gu, " ").trim();
  if (!normalized) return [...input];
  let tokens = expand(tokenize(normalized), normalized);
  // When the search explicitly asks for an AI coach, the bare word "coach"
  // otherwise pulls in exercise coaches even though the AI context is explicit.
  if (normalized.includes("ai教練")) tokens = tokens.filter((token) => token !== "教練");
  if (!tokens.length) return [];
  const ranked = input.map((topic, index) => ({ topic, index, score: scoreTopic(topic, tokens, normalized) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const minimumScore = Math.max(4, (ranked[0]?.score ?? 0) * 0.38);
  return ranked.filter((item) => item.score >= minimumScore)
    .map((item) => item.topic);
}
