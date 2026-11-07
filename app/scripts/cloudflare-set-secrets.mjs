import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Run only after the owner confirms this exact Worker secret destination.
const args = process.argv.slice(2);
if (!args.includes('--approved-worker-secret-destination')) {
  throw new Error('Owner confirmation of the Worker secret destination is required.');
}
const fileIndex = args.indexOf('--key-file');
if (fileIndex < 0 || !args[fileIndex + 1]) throw new Error('A confirmed existing key file is required.');
const key = readFileSync(resolve(args[fileIndex + 1]), 'utf8').trim();
if (!/^sk-[A-Za-z0-9_-]+$/.test(key)) throw new Error('The selected key file does not contain one API key.');
const worker = 'puma-policy-v1';
try {
  execFileSync(resolve('node_modules/.bin/wrangler'), ['secret', 'bulk', '--name', worker], {
    cwd: process.cwd(),
    input: JSON.stringify({ OPENAI_API_KEY: key, RATE_LIMIT_SALT: randomBytes(32).toString('base64url') }),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_LOG: 'error', WRANGLER_LOG_SANITIZE: 'true', WRANGLER_LOG_PATH: '.wrangler/logs/secret-write.log', WRANGLER_SEND_METRICS: 'false' },
  });
  console.log(JSON.stringify({ ok: true, worker, secretNames: ['OPENAI_API_KEY', 'RATE_LIMIT_SALT'] }));
} catch {
  console.error(JSON.stringify({ ok: false, worker, message: 'Secret setup failed; command output suppressed to protect credentials.' }));
  process.exitCode = 1;
}
