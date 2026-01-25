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
  await writeFile(indexJsPath, 'export { default } from "../pi.js";\n', "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
