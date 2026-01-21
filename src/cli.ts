#!/usr/bin/env bun

import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { generateDefaultConfig } from "./config/loader";

type WriteMode = "write-if-missing" | "overwrite" | "write-if-different";
type CopyMode = "copy-if-missing" | "overwrite" | "copy-if-different";
type LinkMode = "link-if-different" | "overwrite";

type Action =
  | { kind: "assert-exists"; path: string; hint?: string }
  | { kind: "mkdir"; path: string }
  | { kind: "write"; path: string; content: string; mode: WriteMode }
  | { kind: "copy"; from: string; to: string; recursive: boolean; mode: CopyMode }
  | { kind: "symlink"; from: string; to: string; mode: LinkMode };

type Summary = {
  created: string[];
  modified: string[];
  copied: string[];
  linked: string[];
  skipped: string[];
};

function usage(): string {
  return `agentsbox

Usage:
  agentsbox init [--dry-run] [--force]
  agentsbox setup opencode [--dry-run] [--force]
  agentsbox setup pi [--dry-run] [--force]

Commands:
  init
    Create ~/.config/agentsbox/config.jsonc + install bundled skill.

  setup opencode
    Install agentsbox as a local OpenCode plugin (auto-loaded).

  setup pi
    Install agentsbox as a local pi extension (auto-discovered).

Defaults:
  agentsbox config dir:  ~/.config/agentsbox
  OpenCode plugins dir:  ~/.config/opencode/plugins
  pi extensions dir:     ~/.pi/agent/extensions

Options:
  --dry-run    Print planned filesystem changes only
  --force      Overwrite existing files/links
`;
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

async function lstatIfExists(p: string) {
  try {
    // lstat() does NOT follow symlinks, so it correctly reports dangling/broken symlinks.
    return await lstat(p);
  } catch {
    return null;
  }
}

async function pathExists(p: string): Promise<boolean> {
  return (await lstatIfExists(p)) !== null;
}

async function readTextIfExists(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function readSymlinkTargetIfExists(p: string): Promise<string | null> {
  try {
    return await readlink(p);
  } catch {
    return null;
  }
}

function getPkgRoot(): string {
  // Works from dist/cli.js and from src/cli.ts
  const here = dirname(fileURLToPath(import.meta.url));
  return dirname(here);
}

function getXdgConfigHome(): string {
  // We keep XDG_CONFIG_HOME support, but do not provide CLI flags for paths.
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}

function table(title: string, rows: Array<[string, string]>): string {
  const leftW = Math.max(...rows.map((r) => r[0].length), 7);
  const rightW = Math.max(...rows.map((r) => r[1].length), 5);
  const line = `+${"-".repeat(leftW + 2)}+${"-".repeat(rightW + 2)}+`;
  const header = `| ${title.padEnd(leftW)} | ${"".padEnd(rightW)} |`;
  const body = rows.map(([k, v]) => `| ${k.padEnd(leftW)} | ${v.padEnd(rightW)} |`).join("\n");
  return `${line}\n${header}\n${line}\n${body}\n${line}`;
}

function summarize(summary: Summary): string {
  const rows: Array<[string, string]> = [
    ["created", String(summary.created.length)],
    ["modified", String(summary.modified.length)],
    ["copied", String(summary.copied.length)],
    ["linked", String(summary.linked.length)],
    ["skipped", String(summary.skipped.length)],
  ];
  return table("summary", rows);
}

function printList(header: string, paths: string[]) {
  if (paths.length === 0) return;
  console.log(`\n${header}`);
  for (const p of paths) console.log(`- ${p}`);
}

async function confirmApply(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question("\nApply these changes? [y/N] ")).trim();
    return ans === "y" || ans === "Y" || ans.toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

function addEffect(summary: Summary, effect: keyof Summary, p: string) {
  summary[effect].push(p);
}

async function applyPlannedActions(actions: Action[], opts: { dryRun: boolean; force: boolean }) {
  const { dryRun, force } = opts;

  // Always print plan first
  for (const a of actions) {
    switch (a.kind) {
      case "assert-exists":
        console.log(`check   ${a.path}${a.hint ? ` (${a.hint})` : ""}`);
        break;
      case "mkdir":
        console.log(`mkdir   ${a.path}`);
        break;
      case "write":
        console.log(`write   ${a.path} (${a.mode})`);
        break;
      case "copy":
        console.log(`copy    ${a.from} -> ${a.to} (${a.mode})`);
        break;
      case "symlink":
        console.log(`symlink ${a.from} -> ${a.to} (${a.mode})`);
        break;
    }
  }

  if (dryRun) return;

  const ok = await confirmApply();
  if (!ok) {
    console.log("\nAborted (no changes applied).");
    return;
  }

  const summary: Summary = { created: [], modified: [], copied: [], linked: [], skipped: [] };

  for (const a of actions) {
    switch (a.kind) {
      case "assert-exists": {
        if (!existsSync(a.path)) {
          throw new Error(`Missing required path: ${a.path}${a.hint ? `. ${a.hint}` : ""}`);
        }
        break;
      }
      case "mkdir": {
        const existed = await pathExists(a.path);
        await mkdir(a.path, { recursive: true });
        addEffect(summary, existed ? "skipped" : "created", a.path);
        break;
      }
      case "write": {
        const existing = await readTextIfExists(a.path);
        const exists = existing !== null;

        if (a.mode === "write-if-missing" && exists && !force) {
          addEffect(summary, "skipped", a.path);
          break;
        }

        if (a.mode === "write-if-different" && exists && existing === a.content && !force) {
          addEffect(summary, "skipped", a.path);
          break;
        }

        await mkdir(dirname(a.path), { recursive: true });
        await writeFile(a.path, a.content, "utf8");
        addEffect(summary, exists ? "modified" : "created", a.path);
        break;
      }
      case "copy": {
        if (!existsSync(a.from)) {
          throw new Error(`Missing source path: ${a.from}`);
        }

        const destExists = await pathExists(a.to);

        if (a.mode === "copy-if-missing" && destExists && !force) {
          addEffect(summary, "skipped", a.to);
          break;
        }

        if (a.mode === "copy-if-different" && destExists && !force) {
          const srcStat = await stat(a.from);
          const dstStat = await stat(a.to);
          const bothFiles = srcStat.isFile() && dstStat.isFile();
          if (bothFiles && srcStat.size === dstStat.size) {
            const [srcBuf, dstBuf] = await Promise.all([readFile(a.from), readFile(a.to)]);
            if (Buffer.compare(srcBuf, dstBuf) === 0) {
              addEffect(summary, "skipped", a.to);
              break;
            }
          }
        }

        await mkdir(dirname(a.to), { recursive: true });
        await cp(a.from, a.to, { recursive: a.recursive, force: true });
        addEffect(summary, destExists ? "copied" : "created", a.to);
        break;
      }
      case "symlink": {
        const destStat = await lstatIfExists(a.to);
        const destExists = destStat !== null;
        const destIsSymlink = destStat?.isSymbolicLink() ?? false;

        // If destination is a symlink (even dangling), we can safely compare/replace.
        const currentTarget = destIsSymlink ? await readSymlinkTargetIfExists(a.to) : null;

        // Idempotent: same symlink target.
        if (destExists && destIsSymlink && currentTarget === a.from) {
          addEffect(summary, "skipped", a.to);
          break;
        }

        // Non-symlink destination: never auto-delete user directories/files.
        if (destExists && !destIsSymlink) {
          if (a.mode === "overwrite") {
            throw new Error(
              `Refusing to overwrite non-symlink path: ${a.to}. ` +
                `Please remove it manually and re-run, or choose a different destination.`,
            );
          }

          addEffect(summary, "skipped", a.to);
          break;
        }

        // For symlinks: replace if different and mode allows it.
        if (destExists && destIsSymlink && a.mode === "link-if-different") {
          await rm(a.to, { force: true });
        } else if (destExists && destIsSymlink && a.mode === "overwrite") {
          await rm(a.to, { force: true });
        } else if (destExists) {
          // destExists but not symlink handled above.
          addEffect(summary, "skipped", a.to);
          break;
        }

        await mkdir(dirname(a.to), { recursive: true });
        await symlink(a.from, a.to);
        addEffect(summary, "linked", a.to);
        break;
      }
    }
  }

  console.log(`\n${summarize(summary)}`);
  printList("Created", summary.created);
  printList("Modified", summary.modified);
  printList("Copied", summary.copied);
  printList("Linked", summary.linked);
  printList("Skipped", summary.skipped);
}

async function planInit(opts: {
  configDir: string;
  force: boolean;
  pkgRoot: string;
}): Promise<Action[]> {
  const { configDir, force, pkgRoot } = opts;

  const configPath = join(configDir, "config.jsonc");
  const srcSkillDir = join(pkgRoot, "skill", "agentsbox");
  const destSkillDir = join(configDir, "skill", "agentsbox");

  const actions: Action[] = [];
  actions.push({ kind: "mkdir", path: configDir });

  const configExists = await pathExists(configPath);
  if (!configExists || force) {
    const content = generateDefaultConfig("0.0.0");
    actions.push({
      kind: "write",
      path: configPath,
      content,
      mode: force ? "overwrite" : "write-if-missing",
    });
  }

  const skillExists = await pathExists(destSkillDir);
  if (!skillExists || force) {
    actions.push({ kind: "mkdir", path: dirname(destSkillDir) });
    actions.push({
      kind: "copy",
      from: srcSkillDir,
      to: destSkillDir,
      recursive: true,
      mode: force ? "overwrite" : "copy-if-missing",
    });
  }

  return actions;
}

async function planSetupOpencode(opts: {
  configDir: string;
  force: boolean;
  pkgRoot: string;
  opencodePluginsDir: string;
}): Promise<Action[]> {
  const { configDir, force, pkgRoot, opencodePluginsDir } = opts;

  const actions: Action[] = [];

  // OpenCode auto-loads *.js/*.ts from ~/.config/opencode/plugins/
  const srcPluginFile = join(pkgRoot, "dist", "opencode.js");
  actions.push({ kind: "assert-exists", path: srcPluginFile, hint: "Run: bun run build" });

  // Ensure agentsbox config + skill
  actions.push(...(await planInit({ configDir, force, pkgRoot })));

  const destPluginFile = join(opencodePluginsDir, "agentsbox.js");

  actions.push({ kind: "mkdir", path: opencodePluginsDir });
  actions.push({
    kind: "copy",
    from: srcPluginFile,
    to: destPluginFile,
    recursive: false,
    mode: force ? "overwrite" : "copy-if-different",
  });

  return actions;
}

async function planSetupPi(opts: {
  configDir: string;
  force: boolean;
  pkgRoot: string;
  piExtensionsDir: string;
}): Promise<Action[]> {
  const { configDir, force, pkgRoot, piExtensionsDir } = opts;

  const actions: Action[] = [];

  // Ensure built pi entrypoint exists (checked at apply-time, after confirmation)
  const srcPiEntrypoint = join(pkgRoot, "dist", "pi.js");
  actions.push({ kind: "assert-exists", path: srcPiEntrypoint, hint: "Run: bun run build" });

  // Ensure agentsbox config + skill
  actions.push(...(await planInit({ configDir, force, pkgRoot })));

  const wrapperDir = join(configDir, "integrations", "pi", "extension");
  const wrapperPkgJson = join(wrapperDir, "package.json");
  const wrapperIndex = join(wrapperDir, "src", "index.ts");

  const wrapperPkgContent = `{
  "name": "agentsbox-pi-extension",
  "private": true,
  "type": "module",
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
`;

  const wrapperIndexContent = `import ext from "agentsbox/pi";

export default ext;
`;

  actions.push({ kind: "mkdir", path: wrapperDir });
  actions.push({ kind: "mkdir", path: join(wrapperDir, "src") });
  actions.push({ kind: "mkdir", path: join(wrapperDir, "node_modules") });

  actions.push({
    kind: "write",
    path: wrapperPkgJson,
    content: wrapperPkgContent,
    mode: force ? "overwrite" : "write-if-different",
  });
  actions.push({
    kind: "write",
    path: wrapperIndex,
    content: wrapperIndexContent,
    mode: force ? "overwrite" : "write-if-different",
  });

  // Link the current agentsbox package into wrapper/node_modules
  actions.push({
    kind: "symlink",
    from: pkgRoot,
    to: join(wrapperDir, "node_modules", "agentsbox"),
    mode: force ? "overwrite" : "link-if-different",
  });

  // Register extension for pi by symlinking the wrapper into pi extensions
  actions.push({ kind: "mkdir", path: piExtensionsDir });
  actions.push({
    kind: "symlink",
    from: wrapperDir,
    to: join(piExtensionsDir, "agentsbox"),
    mode: force ? "overwrite" : "link-if-different",
  });

  return actions;
}

async function main() {
  const argv = Bun.argv.slice(2);
  if (argv.length === 0 || hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    console.log(usage());
    process.exit(0);
  }

  const cmd = argv[0];
  const dryRun = hasFlag(argv, "--dry-run");
  const force = hasFlag(argv, "--force");

  const xdgConfigHome = getXdgConfigHome();
  const pkgRoot = getPkgRoot();

  const configDir = join(xdgConfigHome, "agentsbox");
  const opencodePluginsDir = join(xdgConfigHome, "opencode", "plugins");
  const piExtensionsDir = join(homedir(), ".pi", "agent", "extensions");

  if (cmd === "init") {
    const actions = await planInit({ configDir, force, pkgRoot });
    await applyPlannedActions(actions, { dryRun, force });
    return;
  }

  if (cmd === "setup") {
    const target = argv[1];

    if (target === "opencode") {
      const actions = await planSetupOpencode({ configDir, force, pkgRoot, opencodePluginsDir });
      await applyPlannedActions(actions, { dryRun, force });
      return;
    }

    if (target === "pi") {
      const actions = await planSetupPi({ configDir, force, pkgRoot, piExtensionsDir });
      await applyPlannedActions(actions, { dryRun, force });
      return;
    }

    console.error(`Unknown setup target: ${target ?? ""}`);
    console.log(usage());
    process.exit(1);
  }

  console.error(`Unknown command: ${cmd}`);
  console.log(usage());
  process.exit(1);
}

await main();
