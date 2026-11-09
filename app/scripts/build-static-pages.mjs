import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTopicPages } from './build-topic-pages.mjs';
import { buildAdminAssets } from './build-admin-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "static-dist");
const publicDir = resolve(root, "public");

// Rebuild from authoritative public assets each time; never reuse Vite's dist.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(publicDir, output, { recursive: true });
// Private dashboard assets are embedded behind JWT authorization, never served as public static files.
await rm(resolve(output, 'admin'), { recursive: true, force: true });
await buildAdminAssets();
await buildTopicPages(output);
await cp(resolve(output, "topics/index.html"), resolve(output, "index.html"));
await writeFile(resolve(output, "_headers"), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
`);
await build({
  entryPoints: [resolve(root, "worker/index.ts")],
  outfile: resolve(output, "_worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
});
await writeFile(resolve(output, "_routes.json"), `${JSON.stringify({ version: 1, include: ["/api/*", "/admin", "/admin/*"], exclude: [] }, null, 2)}\n`);

console.log(`Built static Pages output at ${relative(root, output)}`);
