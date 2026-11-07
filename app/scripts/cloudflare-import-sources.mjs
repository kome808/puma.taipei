#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const WRANGLER = process.env.WRANGLER_BIN || path.join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler');
const DEFAULT_ACCOUNT_ID = '4c10afbddf5fd32960496609cc2061d0';
const DEFAULT_BUCKET = 'puma-policy-v1-sources';
const DEFAULT_INSTANCE = 'puma-policy-v1';
const DEFAULT_CORPUS = path.join(PROJECT_ROOT, 'generated', 'corpus.json');
const DEFAULT_SEARCH_DOCS = path.join(PROJECT_ROOT, 'generated', 'search-docs');
const API_ROOT = 'https://api.cloudflare.com/client/v4';
const MAX_ITEM_BYTES = 10 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;

let cachedApiToken = null;

function resolveApiToken() {
  const environmentToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (environmentToken) return environmentToken;

  try {
    const output = execFileSync(WRANGLER, ['auth', 'token', '--json'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WRANGLER_LOG: process.env.WRANGLER_LOG || 'error' },
    });
    const credentials = JSON.parse(output);
    if (credentials?.type !== 'oauth' || typeof credentials.token !== 'string' || !credentials.token) {
      throw new Error('Wrangler did not return an OAuth credential');
    }
    return credentials.token;
  } catch {
    throw new Error(
      'AI Search REST uploads require CLOUDFLARE_API_TOKEN or a valid existing Wrangler OAuth session',
    );
  }
}

function getApiToken() {
  if (!cachedApiToken) cachedApiToken = resolveApiToken();
  return cachedApiToken;
}

function usage() {
  console.log(`Usage: node scripts/cloudflare-import-sources.mjs [options]

Archive generated corpus/search documents in R2 and index each source Markdown file
in the managed AI Search instance's built-in storage.

Options:
  --corpus <path>       Corpus JSON (default: generated/corpus.json)
  --search-docs <dir>   Per-source Markdown directory (default: generated/search-docs)
  --prefix <key>        R2 archive prefix (default: archive/<corpus.version>)
  --bucket <name>       R2 bucket (default: ${DEFAULT_BUCKET})
  --instance <name>     AI Search instance (default: ${DEFAULT_INSTANCE})
  --account-id <id>     Cloudflare account ID (default: configured account)
  --replace             Delete existing AI Search items with matching keys before upload
  --wait                Ask AI Search to wait for indexing confirmation when possible
  --skip-r2             Do not upload the archive to R2
  --skip-ai-search      Do not upload/index AI Search items
  --dry-run             Print the planned work without making network changes
  -h, --help            Show this help

R2 uses Wrangler's existing authentication. AI Search REST uploads use
CLOUDFLARE_API_TOKEN when provided, otherwise the importer reuses the existing
Wrangler OAuth credential in process memory; credentials are never printed or persisted.
`);
}

function parseArgs(argv) {
  const options = {
    corpus: DEFAULT_CORPUS,
    searchDocs: DEFAULT_SEARCH_DOCS,
    bucket: DEFAULT_BUCKET,
    instance: DEFAULT_INSTANCE,
    accountId: DEFAULT_ACCOUNT_ID,
    replace: false,
    wait: false,
    skipR2: false,
    skipAiSearch: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--replace') {
      options.replace = true;
      continue;
    }
    if (arg === '--wait') {
      options.wait = true;
      continue;
    }
    if (arg === '--skip-r2') {
      options.skipR2 = true;
      continue;
    }
    if (arg === '--skip-ai-search') {
      options.skipAiSearch = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    const valueFlags = {
      '--corpus': 'corpus',
      '--search-docs': 'searchDocs',
      '--prefix': 'prefix',
      '--bucket': 'bucket',
      '--instance': 'instance',
      '--account-id': 'accountId',
    };
    if (arg in valueFlags) {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value`);
      options[valueFlags[arg]] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  options.corpus = path.resolve(PROJECT_ROOT, options.corpus);
  options.searchDocs = path.resolve(PROJECT_ROOT, options.searchDocs);
  return options;
}

function ensureSafeKey(key, label = 'key') {
  const normalized = key.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || segments.some(segment => segment === '..' || segment === '.')) {
    throw new Error(`Unsafe ${label}: ${key}`);
  }
  if (normalized.length > 512) throw new Error(`${label} is too long: ${normalized.length} characters`);
  return normalized;
}

function collectMarkdownFiles(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Search-docs directory does not exist: ${directory}`);
  }
  const results = [];
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const relative = path.relative(directory, absolute).split(path.sep).join('/');
        results.push({ absolute, relative, bytes: statSync(absolute).size });
      }
    }
  };
  visit(directory);
  results.sort((left, right) => left.relative.localeCompare(right.relative));
  if (!results.length) throw new Error(`No Markdown files found under ${directory}`);
  for (const item of results) {
    if (item.bytes > MAX_ITEM_BYTES) {
      throw new Error(`Search document exceeds 10 MiB: ${item.relative}`);
    }
  }
  return results;
}

function readCorpusVersion(file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`Corpus file does not exist: ${file}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Corpus JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const rawVersion = typeof parsed?.version === 'string' && parsed.version.trim() ? parsed.version.trim() : 'unversioned';
  const version = rawVersion.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return version || 'unversioned';
}

function mimeFor(file) {
  if (file.toLowerCase().endsWith('.json')) return 'application/json';
  return 'text/markdown; charset=utf-8';
}

function runR2Upload(bucket, key, file, dryRun) {
  const objectPath = `${bucket}/${ensureSafeKey(key, 'R2 object key')}`;
  const args = [
    'r2',
    'object',
    'put',
    objectPath,
    '--remote',
    '--file',
    file,
    '--content-type',
    mimeFor(file),
    '--force',
  ];
  console.log(`${dryRun ? '[dry-run] ' : ''}wrangler ${args.join(' ')}`);
  if (dryRun) return;
  execFileSync(WRANGLER, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_LOG: process.env.WRANGLER_LOG || 'error' },
  });
}

function apiUrl(accountId, instance, suffix = '') {
  return `${API_ROOT}/accounts/${encodeURIComponent(accountId)}/ai-search/namespaces/default/instances/${encodeURIComponent(instance)}${suffix}`;
}

async function fetchJson(url, init = {}, attempt = 0) {
  const token = getApiToken();

  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = null;
  }

  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15_000) : 750 * 2 ** attempt;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return fetchJson(url, init, attempt + 1);
  }
  if (!response.ok || body?.success === false) {
    const cloudflareMessage = Array.isArray(body?.errors) ? body.errors.map(error => error.message).filter(Boolean).join('; ') : '';
    throw new Error(`AI Search request failed (${response.status})${cloudflareMessage ? `: ${cloudflareMessage}` : ''}`);
  }
  return body;
}

async function listItems(accountId, instance, key) {
  const url = new URL(apiUrl(accountId, instance, '/items'));
  url.searchParams.set('key', key);
  url.searchParams.set('source', 'builtin');
  const body = await fetchJson(url);
  return Array.isArray(body?.result) ? body.result : [];
}

async function deleteItem(accountId, instance, itemId) {
  await fetchJson(apiUrl(accountId, instance, `/items/${encodeURIComponent(itemId)}`), { method: 'DELETE' });
}

async function uploadItem(accountId, instance, key, file, wait) {
  const bytes = readFileSync(file);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeFor(file) }), key);
  if (wait) form.append('wait_for_completion', 'true');
  return fetchJson(apiUrl(accountId, instance, '/items'), { method: 'POST', body: form });
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const run = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const corpusVersion = readCorpusVersion(options.corpus);
  const prefix = ensureSafeKey(options.prefix || `archive/${corpusVersion}`, 'archive prefix').replace(/\/$/, '');
  const documents = collectMarkdownFiles(options.searchDocs);

  console.log(`Corpus: ${path.relative(PROJECT_ROOT, options.corpus)} (version ${corpusVersion})`);
  console.log(`Source documents: ${documents.length}`);
  if (!options.skipR2) {
    runR2Upload(options.bucket, `${prefix}/corpus.json`, options.corpus, options.dryRun);
    for (const document of documents) {
      runR2Upload(options.bucket, `${prefix}/search-docs/${document.relative}`, document.absolute, options.dryRun);
    }
  }

  if (options.skipAiSearch) {
    console.log('AI Search import skipped (--skip-ai-search).');
    return;
  }
  if (options.dryRun) {
    for (const document of documents) {
      const key = ensureSafeKey(`search-docs/${document.relative}`, 'AI Search item key');
      if (key.length > 128) throw new Error(`AI Search item key exceeds 128 characters: ${key}`);
      console.log(`[dry-run] AI Search upload ${key} (${document.bytes} bytes)`);
    }
    console.log('Dry run complete.');
    return;
  }
  // Resolve once. The token stays process-local and is never sent to logs or files.
  getApiToken();
  const outcomes = await mapWithConcurrency(documents, UPLOAD_CONCURRENCY, async document => {
    const key = ensureSafeKey(`search-docs/${document.relative}`, 'AI Search item key');
    if (key.length > 128) throw new Error(`AI Search item key exceeds 128 characters: ${key}`);
    const existing = await listItems(options.accountId, options.instance, key);
    if (existing.length && !options.replace) {
      console.log(`AI Search skip existing item: ${key}`);
      return 'skipped';
    }
    if (existing.length && options.replace) {
      for (const item of existing) {
        if (item?.id) await deleteItem(options.accountId, options.instance, item.id);
      }
    }
    const response = await uploadItem(options.accountId, options.instance, key, document.absolute, options.wait);
    const item = response?.result;
    console.log(`AI Search indexed: ${key}${item?.status ? ` (${item.status})` : ''}`);
    return 'uploaded';
  });
  const uploaded = outcomes.filter(outcome => outcome === 'uploaded').length;
  const skipped = outcomes.filter(outcome => outcome === 'skipped').length;

  const stats = await fetchJson(apiUrl(options.accountId, options.instance, '/stats'));
  const summary = stats?.result || {};
  console.log(`AI Search import complete: uploaded ${uploaded}, skipped ${skipped}; queued ${summary.queued ?? 0}, running ${summary.running ?? 0}, completed ${summary.completed ?? 0}, errors ${summary.error ?? 0}`);
}

main().catch(error => {
  console.error(`Source import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
