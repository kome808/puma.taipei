import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';

const base = 'https://puma-policy-v1.kome808.workers.dev';
const report = { checkedAt: new Date().toISOString(), base, checks: [] };
for (const path of ['/api/health', '/api/config']) {
  const response = await fetch(base + path);
  const data = await response.json();
  assert.equal(response.status, 200, path);
  if (path.endsWith('health')) assert.equal(data.ok, true);
  else { assert.equal(data.live, true); assert.ok(data.turnstileSiteKey); }
  assert.equal(data.stats.updatedAt, data.stats.version.slice(0, 10), 'data date follows the imported source snapshot');
  report.checks.push({ path, status: response.status, sources: data.stats?.sources, passages: data.stats?.passages, version: data.stats?.version, updatedAt: data.stats?.updatedAt, ...(path.endsWith('config') ? { live: data.live, verificationConfigured: Boolean(data.turnstileSiteKey) } : {}) });
}
for (const query of ['社區運動小巴及特色運動據點', '都更案卡住之後可以退場或換屋嗎？']) {
  const response = await fetch(base + '/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ query, mode: 'share' }) });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data.error));
  assert.ok(data.results.length);
  report.checks.push({ query, status: response.status, searchMethod: data.searchMethod, results: data.results.length, firstTitle: data.results[0].title });
}
const denied = await fetch(base + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ query: '運動政策', mode: 'share' }) });
assert.equal(denied.status, 403, 'generation without a verification token must fail');
report.checks.push({ path: '/api/generate', withoutVerification: true, status: denied.status });
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/public-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
