import { describe, expect, test } from "bun:test";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

async function createSandboxPackageRoot(opts: { withDistPi: boolean }): Promise<string> {
  const repoRoot = join(import.meta.dir, "..", "..");
  // realpath resolves macOS /var → /private/var symlink.
  const sandboxRoot = await realpath(await mkdtemp(join(tmpdir(), "agentsbox-pkg-")));

  await cp(join(repoRoot, "src"), join(sandboxRoot, "src"), { recursive: true });
  await cp(join(repoRoot, "skill"), join(sandboxRoot, "skill"), { recursive: true });
  await cp(join(repoRoot, "agentsbox.schema.json"), join(sandboxRoot, "agentsbox.schema.json"));
  await cp(join(repoRoot, "example-config.jsonc"), join(sandboxRoot, "example-config.jsonc"));
  await symlink(join(repoRoot, "node_modules"), join(sandboxRoot, "node_modules"));

  if (opts.withDistPi) {
    const distDir = join(sandboxRoot, "dist");
    await mkdir(distDir, { recursive: true });
    // CLI only checks existence during apply, so a small placeholder is sufficient.
    await writeFile(
      join(distDir, "pi.js"),
      "export default function agentsboxPiExtension() {}\n",
      "utf8",
    );
  }

  return sandboxRoot;
}

describe("agentsbox cli symlink handling", () => {
  test("setup pi replaces a dangling symlink without --force", async () => {
    const sandboxRoot = await createSandboxPackageRoot({ withDistPi: true });

    const home = await mkdtemp(join(tmpdir(), "agentsbox-pi-home-"));
    const xdg = await mkdtemp(join(tmpdir(), "agentsbox-pi-xdg-"));

    const piDest = join(home, ".pi", "agent", "extensions", "agentsbox.js");

    try {
      // Pre-create a broken/dangling symlink where setup wants to link pi.js.
      await mkdir(dirname(piDest), { recursive: true });
      await symlink(join(home, "does-not-exist"), piDest);

      const proc = Bun.spawn({
        cmd: ["bun", "src/cli.ts", "setup", "pi"],
        cwd: sandboxRoot,
        env: {
          ...process.env,
          HOME: home,
          XDG_CONFIG_HOME: xdg,
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });

      proc.stdin.write("y\n");
      proc.stdin.end();

      const [exitCode, stdoutText, stderrText] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      expect(exitCode).toBe(0);
      expect(stderrText.trim()).toBe("");
      expect(stdoutText).toContain("symlink");

      const st = await lstat(piDest);
      expect(st.isSymbolicLink()).toBe(true);

      const target = await readlink(piDest);
      expect(target).toBe(join(sandboxRoot, "dist", "pi.js"));
    } finally {
      await rm(sandboxRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
      await rm(xdg, { recursive: true, force: true });
    }
  });
});
