CREATE TABLE IF NOT EXISTS request_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS generation_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  mode TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_usd REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS generation_usage_date ON generation_usage(created_at);
-- 2026-11-07：匿名錯誤回報（只存題號、類型與說明；不存姓名、聯絡方式或IP）。保存180天。
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  type TEXT NOT NULL,
  note TEXT NOT NULL,
  content_version TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  resolution TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS reports_topic ON reports(topic_id);

-- Independent of the source corpus and report data; never reset on deployment.
CREATE TABLE IF NOT EXISTS semantic_search_usage (
  period TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK(count >= 0 AND count <= 1000),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topic_search_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS policy_topic_fts USING fts5(
  id UNINDEXED, corpus_version UNINDEXED, title, question, keywords, body,
  payload UNINDEXED, tokenize='unicode61'
);
