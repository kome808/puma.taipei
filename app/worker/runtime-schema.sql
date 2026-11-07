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
