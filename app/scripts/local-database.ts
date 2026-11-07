import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Database, Statement } from '../worker/types';

export function openLocalDatabase(filename = ':memory:') {
  const root = resolve(import.meta.dirname, '..');
  const sqlite = new DatabaseSync(filename);
  for (const name of ['generated/schema.sql', 'generated/data.sql', 'worker/runtime-schema.sql', 'generated/topic-search-data.sql']) sqlite.exec(readFileSync(resolve(root, name), 'utf8'));
  class LocalStatement implements Statement {
    constructor(private sql: string, private values: unknown[] = []) {}
    bind(...values: unknown[]) { return new LocalStatement(this.sql, values); }
    async first<T>(column?: string): Promise<T | null> {
      const row = sqlite.prepare(this.sql).get(...this.values as Array<string | number | null>) as Record<string, unknown> | undefined;
      return row ? (column ? row[column] : row) as T : null;
    }
    async all<T>() { return { results: sqlite.prepare(this.sql).all(...this.values as Array<string | number | null>) as T[], success: true }; }
    async run() { return sqlite.prepare(this.sql).run(...this.values as Array<string | number | null>); }
  }
  const db: Database = {
    prepare: (sql) => new LocalStatement(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  return { db, close: () => sqlite.close() };
}
