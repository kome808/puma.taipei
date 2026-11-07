export type Mode = 'share' | 'reply';
export type SourceKind = 'official' | 'interview' | 'article' | 'framework';

export interface PolicySource {
  id: string;
  title: string;
  url: string;
  kind: SourceKind;
  publishedAt: string | null;
  retrievedAt: string;
  groupId: string;
  verification: string;
  notes: string[];
  relatedUrls: string[];
}

export interface Passage {
  id: string;
  sourceId: string;
  text: string;
  section: string;
  tokens: string;
}

export interface Corpus {
  version: string;
  sources: PolicySource[];
  passages: Passage[];
}

export interface Evidence {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  kind: SourceKind;
  text: string;
  section: string;
  verification: string;
  notes: string[];
}

export interface PostSource {
  id: string;
  title: string;
  url: string;
  kind: SourceKind;
}

export interface SearchResult {
  query: string;
  results: Evidence[];
  searchMethod: 'ai-search' | 'keyword';
  corpusVersion: string;
}

export interface GeneratedPost extends SearchResult {
  body: string;
  post: string;
  sources: PostSource[];
  characterCount: number;
  limit: number;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  requestId: string;
}

export interface ApiError {
  error: { code: string; message: string; requestId?: string };
}
