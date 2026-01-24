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

    // CLI asserts existence of dist/pi.js and dist/pi-extension/.
    await writeFile(
      join(distDir, "pi.js"),
      "export default function agentsboxPiExtension() {}\n",
      "utf8",
    );

    const piExtDir = join(distDir, "pi-extension");
    await mkdir(piExtDir, { recursive: true });
    await writeFile(join(piExtDir, "index.js"), "export { default } from '../pi.js'\n", "utf8");
    await writeFile(
      join(piExtDir, "package.json"),
      JSON.stringify({ name: "agentsbox", type: "module" }, null, 2) + "\n",
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

    const piDest = join(home, ".pi", "agent", "extensions", "agentsbox");

    try {
      // Pre-create a broken/dangling symlink where setup wants to link dist/pi-extension.
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
      expect(target).toBe(join(sandboxRoot, "dist", "pi-extension"));
    } finally {
      await rm(sandboxRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
      await rm(xdg, { recursive: true, force: true });
    }
  });
});
