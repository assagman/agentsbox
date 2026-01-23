import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultConfigIfMissing, loadConfig } from "../../src/config/loader";

describe("agentsbox config loader (node runtime)", () => {
  test("createDefaultConfigIfMissing + loadConfig work without Bun.file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentsbox-config-"));
    const cfg = join(dir, "config.jsonc");

    try {
      const created = await createDefaultConfigIfMissing(cfg, "0.0.0");
      expect(created).toBe(true);

      const createdAgain = await createDefaultConfigIfMissing(cfg, "0.0.0");
      expect(createdAgain).toBe(false);

      const loaded = await loadConfig(cfg);
      expect(loaded.success).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
