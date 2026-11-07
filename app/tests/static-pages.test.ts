import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "static-dist");

test("Pages configuration is isolated from the legacy Worker and resolves the static package", async () => {
  const configDir = resolve(root, "../pages-static");
  const config = JSON.parse(await readFile(resolve(configDir, "wrangler.jsonc"), "utf8"));
  assert.equal(config.name, "puma-note");
  assert.equal(resolve(configDir, config.pages_build_output_dir), output);
  assert.deepEqual(config.services, []);
  for (const binding of ["d1_databases", "r2_buckets", "ai_search", "ai", "vars"]) {
    assert.equal(binding in config, false, `${binding} must not be inherited by the Pages package`);
  }
});

test("static Pages build is clean, repeatable, and contains the public topic library", async () => {
  execFileSync(process.execPath, [resolve(root, "scripts/build-static-pages.mjs")], { cwd: root });
  const [rootHtml, topicHtml, searchJs, routesText, worker, headers] = await Promise.all([
    readFile(resolve(output, "index.html")),
    readFile(resolve(output, "topics/index.html")),
    readFile(resolve(output, "topics/topic-search.mjs"), "utf8"),
    readFile(resolve(output, "_routes.json"), "utf8"),
    readFile(resolve(output, "_worker.js"), "utf8"),
    readFile(resolve(output, "_headers"), "utf8"),
  ]);
  assert.deepEqual(rootHtml, topicHtml);
  assert.match(searchJs, /export function searchTopics\(/);
  assert.deepEqual(JSON.parse(routesText), { version: 1, include: ["/api/*"], exclude: [] });
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Strict-Transport-Security: max-age=31536000/);
  assert.match(headers, /script-src 'self';/);
  assert.match(headers, /connect-src 'self';/);

  const files = await readdir(output, { recursive: true });
  const paths = files.map(String);
  assert.ok(paths.includes("favicon.svg"));
  assert.ok(paths.includes("topics/data.json"));
  assert.ok(paths.includes("topics/topics.css"));
  assert.ok(paths.includes("topics/topics.js"));
  assert.ok(!paths.some((path) => /assets\/index-.*\.js$/.test(path)));
  assert.ok(!paths.some((path) => /react|legacy-form/i.test(path)));
  assert.doesNotMatch(worker.toString(), /api\.openai\.com|openai/i);
});
