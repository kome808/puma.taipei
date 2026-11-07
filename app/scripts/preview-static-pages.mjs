import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const persist = resolve(app, '.wrangler/topic-preview');
const wrangler = resolve(app, 'node_modules/wrangler/bin/wrangler.js');
let active;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => active?.kill(signal));

// Local files only. Rebuild the topic index without clearing reports or quota.
for (const file of ['worker/runtime-schema.sql', 'generated/topic-search-data.sql']) {
  await new Promise((accept, reject) => {
    active = spawn(process.execPath, [wrangler, 'd1', 'execute', 'puma-policy-v1', '--local', '--persist-to', persist, '--file', resolve(app, file)], { cwd: resolve(app, '../pages-static'), stdio: 'inherit' });
    active.once('error', reject);
    active.once('exit', (code) => code === 0 ? accept() : reject(new Error(`Local topic index preparation failed (${code})`)));
  });
}
// Start outside the legacy Worker's package/config tree. A --cwd flag alone
// still inherited the parent Worker's bindings in local Wrangler verification.
const child = spawn(process.execPath, [
  wrangler,
  'pages', 'dev', resolve(app, 'static-dist'), '--persist-to', persist,
  '--d1', 'DB=be2e70a9-032c-474d-9550-8e6b98cb5cd8',
  '--binding', 'ENVIRONMENT=production', '--binding', 'SEMANTIC_SEARCH_ENABLED=false',
  '--binding', 'SEMANTIC_QUOTA_RESET_DAY=1', ...process.argv.slice(2),
], { cwd: resolve(app, '../pages-static'), stdio: 'inherit' });
active = child;
child.on('error', (error) => {
  console.error(`Pages preview could not start: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
