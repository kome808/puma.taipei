export function getSearchTerms(query: string): string[];
export function searchTopics<T extends Record<string, unknown>>(topics: T[], query: string): T[];
