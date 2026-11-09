import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Database, Statement } from '../worker/types';

export function openLocalDatabase(filename = ':memory:') {
  const root = resolve(import.meta.dirname, '..');
  const sqlite = new DatabaseSync(filename);
  for (const name of ['generated/schema.sql', 'generated/data.sql', 'worker/runtime-schema.sql', 'generated/topic-search-data.sql']) sqlite.exec(readFileSync(resolve(root, name), 'utf8'));
  const analyticsSchema = resolve(root, 'worker/analytics-schema.sql');
  if (existsSync(analyticsSchema)) sqlite.exec(readFileSync(analyticsSchema, 'utf8'));
  class LocalStatement implements Statement {
    constructor(private sql: string, private values: unknown[] = []) {}
    bind(...values: unknown[]) { return new LocalStatement(this.sql, values); }
    async first<T>(column?: string): Promise<T | null> {
      const row = sqlite.prepare(this.sql).get(...this.values as Array<string | number | null>) as Record<string, unknown> | undefined;
      return row ? (column ? row[column] : row) as T : null;
    }
    async all<T>() { return { results: sqlite.prepare(this.sql).all(...this.values as Array<string | number | null>) as T[], success: true }; }
    runSync() { return sqlite.prepare(this.sql).run(...this.values as Array<string | number | null>); }
    async run() { return this.runSync(); }
  }
  const db: Database = {
    prepare: (sql) => new LocalStatement(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      // SQLite transactions must not yield between statements. This models D1's
      // atomic serial batches even when several local HTTP requests run together.
      try { const result = statements.map(statement => (statement as LocalStatement).runSync()); sqlite.exec('COMMIT'); return result; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  return { db, close: () => sqlite.close() };
}
