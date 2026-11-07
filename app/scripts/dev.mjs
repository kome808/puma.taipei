import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--watch', '--import', 'tsx', 'scripts/local-server.ts', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code || 0));
