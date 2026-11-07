import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import manifest from '../shared/topic-search-manifest.json' with { type: 'json' };

test('reimporting the versioned topic index preserves quota, reports, prior versions and prevents duplicates', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../worker/runtime-schema.sql', import.meta.url), 'utf8'));
    db.exec("INSERT INTO semantic_search_usage VALUES('2026-11-01',999,'2026-11-07'); INSERT INTO reports(id,created_at,topic_id,type,note) VALUES('R-00000001','2026-11-07','t028','其他','原有回報'); INSERT INTO policy_topic_fts(id,corpus_version,title) VALUES('t028','previous-version','舊索引');");
    const sql = readFileSync(new URL('../generated/topic-search-data.sql', import.meta.url), 'utf8');
    db.exec(sql); db.exec(sql);
    assert.equal(db.prepare('SELECT count FROM semantic_search_usage').get()!.count, 999);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reports').get()!.n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM policy_topic_fts WHERE corpus_version='previous-version'").get()!.n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM policy_topic_fts WHERE corpus_version=?').get(manifest.corpusVersion)!.n, 86);
    assert.equal(db.prepare("SELECT value FROM topic_search_meta WHERE key='corpus_version'").get()!.value, manifest.corpusVersion);
    assert.ok(Buffer.byteLength(`${manifest.prefix}/`, 'utf8') < 64);
  } finally { db.close(); }
});
