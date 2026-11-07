import type { PostSource } from './contracts';

export const POST_LIMIT = 500;
// Exact hosts already present in the user-supplied, downloaded source index.
const SOURCE_HOSTS = new Set([
  'puma.taipei', 'puma-hub.pages.dev', 'puma-shen-interview.pages.dev',
  'shenboyang-interview.pages.dev', 'puma-interview-2026.pages.dev',
  'puma-taipei-ocean-current.pages.dev', 'puma-transcript.pages.dev',
  'puma-scholars-2026.u8901006.workers.dev',
]);

/** Use the more conservative UTF-16 length so emoji never evade the limit. */
export function countCharacters(text: string): number {
  return text.length;
}

export function readableSourceUrl(value: string): string {
  if (/[\u0000-\u0020\u007f]/.test(value)) throw new Error('Invalid source URL');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || !SOURCE_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error('Unrecognized source URL');
  }
  // Decode only for display/copy. Reserved URL punctuation remains escaped.
  return decodeURI(parsed.href).replace(/[\u0000-\u0020\u007f]/g, (c) => encodeURIComponent(c));
}

export function sourceSuffix(sources: PostSource[]): string {
  const urls = [...new Set(sources.map((source) => readableSourceUrl(source.url)))];
  return urls.length ? `\n\n資料來源：\n${urls.join('\n')}` : '';
}

export function assemblePost(body: string, sources: PostSource[]): string {
  const clean = body.trim().replace(/\r\n?/g, '\n');
  if (!clean) return '';
  return clean + sourceSuffix(sources);
}

export function isPostWithinLimit(post: string): boolean {
  return post.trim().length > 0 && countCharacters(post) <= POST_LIMIT;
}
