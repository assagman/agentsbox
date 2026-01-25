#!/usr/bin/env bun

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Prepares dist/pi-extension/ so it can be symlinked into pi's extensions dir.
 *
 * Goals:
 * - no POSIX shell dependencies (mkdir -p / ln -sf / echo >)
 * - idempotent + fails build on errors
 */
async function main() {
  const pkgRoot = process.cwd();

  const distDir = join(pkgRoot, "dist");
  const extDir = join(distDir, "pi-extension");
  const pkgJsonPath = join(extDir, "package.json");
  const indexJsPath = join(extDir, "index.js");

  await mkdir(extDir, { recursive: true });

  // Ensure we never leave a dangling symlink behind from previous builds.
  // (On Windows, symlink creation may require elevated privileges.)
  await rm(indexJsPath, { force: true });

  // Minimal package.json: ensure ESM semantics for index.js.
  await writeFile(pkgJsonPath, '{"type":"module"}\n', "utf8");

  // Avoid symlink entirely for portability: create a tiny re-export shim.
  // This replaces the previous `ln -sf ../pi.js dist/pi-extension/index.js`.
  // NOTE: We resolve realpath to ensure symlinked extension dirs can find dist/pi.js.
  await writeFile(
    indexJsPath,
    `import { realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const realHere = await realpath(here);
const targetUrl = pathToFileURL(join(realHere, "..", "pi.js")).href;
const mod = await import(targetUrl);

export default mod.default;
`,
    "utf8",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
