import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function createSandboxPackageRoot(): Promise<string> {
  const repoRoot = join(import.meta.dir, "..", "..");
  const sandboxRoot = await mkdtemp(join(tmpdir(), "agentsbox-pkg-"));

  // Copy sources so `getPkgRoot()` resolves to this sandbox (no shared dist/ state).
  await cp(join(repoRoot, "src"), join(sandboxRoot, "src"), { recursive: true });
  await cp(join(repoRoot, "skill"), join(sandboxRoot, "skill"), { recursive: true });

  // Reuse installed deps.
  await symlink(join(repoRoot, "node_modules"), join(sandboxRoot, "node_modules"));

  return sandboxRoot;
}

describe("agentsbox cli setup pi", () => {
  test("prints a plan in --dry-run mode", async () => {
    const sandboxRoot = await createSandboxPackageRoot();
    const home = await mkdtemp(join(tmpdir(), "agentsbox-pi-home-"));
    const xdg = await mkdtemp(join(tmpdir(), "agentsbox-pi-xdg-"));

    try {
      const proc = Bun.spawnSync({
        cmd: ["bun", "src/cli.ts", "setup", "pi", "--dry-run"],
        cwd: sandboxRoot,
        env: {
          ...process.env,
          HOME: home,
          XDG_CONFIG_HOME: xdg,
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(proc.exitCode).toBe(0);
      const out = proc.stdout.toString("utf8");

      // Wrapper dir under XDG_CONFIG_HOME
      expect(out).toContain(join(xdg, "agentsbox", "integrations", "pi", "extension"));

      // pi symlink target under HOME
      expect(out).toContain(join(home, ".pi", "agent", "extensions", "agentsbox"));

      // Ensure we planned a link step
      expect(out).toContain("symlink");
    } finally {
      await rm(sandboxRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
      await rm(xdg, { recursive: true, force: true });
    }
  });

  test("--dry-run prints plan even when dist/pi.js is missing", async () => {
    const sandboxRoot = await createSandboxPackageRoot();
    const home = await mkdtemp(join(tmpdir(), "agentsbox-pi-home-"));
    const xdg = await mkdtemp(join(tmpdir(), "agentsbox-pi-xdg-"));

    try {
      // NOTE: sandbox has no dist/ folder by default.
      const proc = Bun.spawnSync({
        cmd: ["bun", "src/cli.ts", "setup", "pi", "--dry-run"],
        cwd: sandboxRoot,
        env: {
          ...process.env,
          HOME: home,
          XDG_CONFIG_HOME: xdg,
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(proc.exitCode).toBe(0);
      const out = proc.stdout.toString("utf8");

      // We must still print a complete plan.
      expect(out).toContain("check");
      expect(out).toContain(join(xdg, "agentsbox", "integrations", "pi", "extension"));
      expect(out).toContain(join(home, ".pi", "agent", "extensions", "agentsbox"));
    } finally {
      await rm(sandboxRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
      await rm(xdg, { recursive: true, force: true });
    }
  });
});
