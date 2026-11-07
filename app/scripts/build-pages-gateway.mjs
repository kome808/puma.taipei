import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, "pages-dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: [resolve(root, "pages-gateway/index.ts")],
  outfile: resolve(outdir, "_worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
});

await writeFile(
  resolve(outdir, "_routes.json"),
  `${JSON.stringify({ version: 1, include: ["/*"], exclude: [] }, null, 2)}\n`,
);
await writeFile(
  resolve(outdir, "index.html"),
  "<!doctype html><html><head><meta charset=\"utf-8\"><title>Not found</title></head><body>Not found</body></html>\n",
);
