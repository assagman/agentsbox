import { describe, expect, test } from "bun:test";

import agentsboxPiExtension from "../../src/pi";

describe("agentsbox pi extension", () => {
  test("registers agentsbox_* tools", () => {
    const tools: any[] = [];
    const commands: string[] = [];

    agentsboxPiExtension({
      registerTool: (def: any) => tools.push(def),
      registerCommand: (name: string) => commands.push(name),
    });

    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual(
      [
        "agentsbox_execute",
        "agentsbox_perf",
        "agentsbox_search_bm25",
        "agentsbox_search_regex",
        "agentsbox_status",
        "agentsbox_test",
      ].sort(),
    );

    expect(commands.sort()).toEqual(
      ["agentsbox-help", "agentsbox-search", "agentsbox-status"].sort(),
    );
  });
});
