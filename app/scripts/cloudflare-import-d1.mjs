#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const WRANGLER = process.env.WRANGLER_BIN || path.join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler');
const DEFAULT_DATABASE = 'puma-policy-v1';

const SCHEMA_CANDIDATES = ['generated/schema.sql', 'schema.sql'];
const RUNTIME_SCHEMA_CANDIDATES = [
  'worker/runtime-schema.sql',
  'generated/runtime-schema.sql',
  'runtime-schema.sql',
];
const DATA_CANDIDATES = [
  'generated/data.sql',
  'data.sql',
  'generated/runtime-data.sql',
];

function usage() {
  console.log(`Usage: node scripts/cloudflare-import-d1.mjs [options]

Apply generated SQL to the isolated remote D1 database configured in wrangler.jsonc.

Options:
  --schema <path>       Base schema SQL (default: generated/schema.sql)
  --runtime-schema <path> Runtime tables SQL (default: worker/runtime-schema.sql when present)
  --data <path>         Seed SQL (default: generated/data.sql)
  --only <schema|data|all>  Import schema(s), data, or all (default: all)
  --database <name>     Wrangler database name (default: ${DEFAULT_DATABASE})
  --reset-corpus        Clear corpus tables before data import (explicit, destructive to corpus rows only)
  --local               Use local D1 instead of remote (remote is the default)
  --dry-run             Print the planned commands without executing them
  -h, --help            Show this help

The importer never reads or prints API keys. Use Wrangler's existing authentication.
`);
}

function parseArgs(argv) {
  const options = { only: 'all', database: DEFAULT_DATABASE, local: false, dryRun: false, resetCorpus: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--local') {
      options.local = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--reset-corpus') {
      options.resetCorpus = true;
      continue;
    }
    if (arg === '--schema' || arg === '--data' || arg === '--only' || arg === '--database') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (arg === '--runtime-schema') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value`);
      options.runtimeSchema = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!['schema', 'data', 'all'].includes(options.only)) {
    throw new Error(`--only must be schema, data, or all; received ${options.only}`);
  }
  if (options.resetCorpus && options.only === 'schema') {
    throw new Error('--reset-corpus requires --only data or --only all');
  }
  return options;
}

function firstExisting(candidates) {
  for (const relative of candidates) {
    const absolute = path.resolve(PROJECT_ROOT, relative);
    if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  }
  return null;
}

function resolveSql(value, candidates, label, optional = false) {
  const file = value ? path.resolve(PROJECT_ROOT, value) : firstExisting(candidates);
  if (!file) {
    if (optional) return null;
    throw new Error(
      `No ${label} SQL file found. Pass --${label} explicitly or create one of: ${candidates.join(', ')}`,
    );
  }
  if (!file.toLowerCase().endsWith('.sql')) throw new Error(`${label} file must have a .sql extension`);
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`${label} file does not exist: ${file}`);
  return file;
}

function prepareD1File(file, temporaryFiles) {
  const sql = readFileSync(file, 'utf8');
  // Wrangler/D1 wraps file execution itself and rejects explicit BEGIN/COMMIT
  // statements. Strip only standalone transaction lines from generated seed
  // SQL; never alter the checked-in source file.
  const withoutExplicitTransaction = sql.replace(/^\s*(?:BEGIN(?:\s+TRANSACTION)?|COMMIT(?:\s+TRANSACTION)?)\s*;\s*$/gim, '');
  if (withoutExplicitTransaction === sql) return file;
  const temporaryDirectory = temporaryFiles.directory || (temporaryFiles.directory = mkdtempSync(path.join(tmpdir(), 'puma-d1-')));
  const temporaryFile = path.join(temporaryDirectory, path.basename(file));
  writeFileSync(temporaryFile, withoutExplicitTransaction, 'utf8');
  temporaryFiles.files.push(temporaryFile);
  console.log(`prepared ${path.relative(PROJECT_ROOT, file)} without explicit BEGIN/COMMIT for Wrangler D1 execution`);
  return temporaryFile;
}

function runD1(database, file, local, dryRun) {
  const args = ['d1', 'execute', database, local ? '--local' : '--remote', '--file', file];
  const printable = ['wrangler', ...args].join(' ');
  console.log(`${dryRun ? '[dry-run] ' : ''}${printable}`);
  if (dryRun) return;
  execFileSync(WRANGLER, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_LOG: process.env.WRANGLER_LOG || 'error' },
  });
}

function resetCorpus(database, local, dryRun) {
  const command = 'DELETE FROM passage_fts; DELETE FROM passages; DELETE FROM sources; DELETE FROM corpus_meta;';
  const args = ['d1', 'execute', database, local ? '--local' : '--remote', '--command', command];
  const printable = ['wrangler', ...args].join(' ');
  console.log(`${dryRun ? '[dry-run] ' : ''}${printable}`);
  if (dryRun) return;
  execFileSync(WRANGLER, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_LOG: process.env.WRANGLER_LOG || 'error' },
  });
}

const temporaryFiles = { directory: null, files: [] };

try {
  const options = parseArgs(process.argv.slice(2));
  const files = [];
  if (options.only === 'schema' || options.only === 'all') {
    const baseSchema = resolveSql(options.schema, SCHEMA_CANDIDATES, 'schema', true);
    const runtimeSchema = resolveSql(options.runtimeSchema, RUNTIME_SCHEMA_CANDIDATES, 'runtime-schema', true);
    if (!baseSchema && !runtimeSchema) {
      throw new Error(
        `No schema SQL file found. Pass --schema/--runtime-schema explicitly or create one of: ${[
          ...SCHEMA_CANDIDATES,
          ...RUNTIME_SCHEMA_CANDIDATES,
        ].join(', ')}`,
      );
    }
    if (baseSchema) files.push({ label: 'schema', file: baseSchema });
  }
  if (options.only === 'data' || options.only === 'all') {
    files.push({ label: 'data', file: resolveSql(options.data, DATA_CANDIDATES, 'data') });
  }
  if (options.only === 'schema' || options.only === 'all') {
    const runtimeSchema = resolveSql(options.runtimeSchema, RUNTIME_SCHEMA_CANDIDATES, 'runtime-schema', true);
    if (runtimeSchema) files.push({ label: 'runtime schema', file: runtimeSchema });
  }

  console.log(`D1 target: ${options.database} (${options.local ? 'local' : 'remote'})`);
  for (const { label, file } of files) {
    if (options.resetCorpus && label === 'data') resetCorpus(options.database, options.local, options.dryRun);
    console.log(`${label}: ${path.relative(PROJECT_ROOT, file)} (${statSync(file).size} bytes)`);
    runD1(options.database, prepareD1File(file, temporaryFiles), options.local, options.dryRun);
  }
  if (temporaryFiles.directory) rmSync(temporaryFiles.directory, { recursive: true, force: true });
  console.log(options.dryRun ? 'Dry run complete.' : 'D1 import complete.');
} catch (error) {
  if (temporaryFiles.directory) rmSync(temporaryFiles.directory, { recursive: true, force: true });
  console.error(`D1 import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
