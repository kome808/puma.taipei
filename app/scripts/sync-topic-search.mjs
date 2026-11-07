import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
if (apply && args.includes('--dry-run')) throw new Error('Choose either --apply or --dry-run');
const bucketAt = args.indexOf('--bucket');
const bucket = bucketAt < 0 ? 'puma-policy-v1-sources' : args[bucketAt + 1];
if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid R2 bucket name');
if (args.some((arg, i) => arg !== '--apply' && arg !== '--bucket' && !(bucketAt >= 0 && i === bucketAt + 1) && arg !== '--dry-run')) throw new Error('Unknown option');
const manifest = JSON.parse(await readFile(resolve(app, 'shared/topic-search-manifest.json'), 'utf8'));
const root = resolve(app, 'generated/semantic-topics', manifest.prefix);
const files = await readdir(root);
const expected = manifest.topicIds.map((id) => `${id}.md`).sort();
if (JSON.stringify(files.sort()) !== JSON.stringify(expected)) throw new Error('Generated topic index is incomplete; run the public export first');
for (const name of expected) {
  const markdown = await readFile(resolve(root, name), 'utf8');
  if (!markdown.includes(`corpus_version: ${manifest.corpusVersion}`)) throw new Error(`Stale index file: ${name}`);
}
console.log(JSON.stringify({ mode: apply ? 'upload' : 'dry-run', bucket, corpusVersion: manifest.corpusVersion, prefix: manifest.prefix, files: expected.length }, null, 2));
if (!apply) {
  console.log('No network requests or remote changes. Add --apply only during an authorized release.');
} else {
  for (const name of expected) {
    // argv array, never shell interpolation; preserve the exact versioned key.
    const result = spawnSync(process.execPath, [resolve(app, 'node_modules/wrangler/bin/wrangler.js'), 'r2', 'object', 'put', `${bucket}/${manifest.prefix}/${name}`, '--file', resolve(root, name), '--content-type', 'text/markdown; charset=utf-8', '--remote'], { cwd: app, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Upload failed at ${name}; no files were deleted. Safe to rerun the same version.`);
  }
  console.log('Uploaded reviewed topic documents. Confirm the AI Search instance has indexed this exact folder before enabling semantic search.');
}
