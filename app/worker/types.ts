import type { Evidence } from '../shared/contracts';

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success?: boolean }>;
  run(): Promise<unknown>;
}

export interface Database {
  prepare(query: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}

export interface SearchChunk {
  text: string;
  score: number;
  item: { key: string; metadata?: Record<string, unknown> };
}

export interface Env {
  DB: Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  SOURCES?: R2Bucket;
  AI_SEARCH?: {
    search(input: Record<string, unknown>): Promise<{ chunks: SearchChunk[] }>;
  };
  SEMANTIC_SEARCH?: {
    search(input: Record<string, unknown>): Promise<{ chunks: SearchChunk[] }>;
  };
  SEMANTIC_SEARCH_ENABLED?: string;
  REPORTS_ENABLED?: string;
  SEMANTIC_QUOTA_RESET_DAY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ENVIRONMENT?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  DAILY_GLOBAL_LIMIT?: string;
  ALLOWED_ORIGIN?: string;
  RATE_LIMIT_SALT?: string;
  REPORTS_READ_TOKEN?: string;
  REPORTS_WRITE_TOKEN?: string;
}

export interface SearchProvider {
  search(query: string): Promise<{ evidence: Evidence[]; method: 'ai-search' | 'keyword' }>;
}
