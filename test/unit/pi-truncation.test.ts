import { describe, expect, test } from "bun:test";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";

import { truncatePiText } from "../../src/pi";

describe("agentsbox pi tool output truncation", () => {
  test("truncatePiText enforces pi limits (50KB / 2000 lines)", () => {
    const long = Array.from({ length: DEFAULT_MAX_LINES + 100 }, () => "x".repeat(80)).join("\n");

    const r = truncatePiText(long);

    expect(r.truncated).toBe(true);
    expect(r.outputLines).toBeLessThanOrEqual(DEFAULT_MAX_LINES);
    expect(Buffer.byteLength(r.content, "utf-8")).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
  });
});
