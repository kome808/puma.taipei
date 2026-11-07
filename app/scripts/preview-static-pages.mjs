import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Start outside the legacy Worker's package/config tree. A --cwd flag alone
// still inherited the parent Worker's bindings in local Wrangler verification.
const child = spawn(process.execPath, [
  resolve(app, 'node_modules/wrangler/bin/wrangler.js'),
  'pages', 'dev', resolve(app, 'static-dist'), ...process.argv.slice(2),
], { cwd: resolve(app, '../pages-static'), stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(`Pages preview could not start: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
