// phi integration entrypoint (explicit)
// Consumers should import: `agentsbox/phi`

import { Type } from "@sinclair/typebox";

import {
  BM25_DESC,
  createAgentsboxRuntime,
  EXECUTE_DESC,
  getDefaultAgentsboxConfigPath,
  MAX_REGEX_LENGTH,
  PERF_DESC,
  REGEX_DESC,
  STATUS_DESC,
  TEST_DESC,
} from "./runtime";
import { PACKAGE_VERSION } from "./version";

// Self-contained truncation (compatible with phi's extension API)
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
const DEFAULT_MAX_LINES = 2000;

type TruncationResult = {
  content: string;
  truncated: boolean;
  originalLines?: number;
  keptLines?: number;
  originalBytes?: number;
  keptBytes?: number;
};

function truncateHead(
  text: string,
  options: { maxBytes?: number; maxLines?: number } = {},
): TruncationResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;

  const lines = text.split("\n");
  const originalLines = lines.length;
  const originalBytes = Buffer.byteLength(text, "utf8");

  // Check if truncation needed
  if (originalBytes <= maxBytes && originalLines <= maxLines) {
    return { content: text, truncated: false };
  }

  // Truncate from head (keep tail)
  let keptLines = lines;
  if (originalLines > maxLines) {
    keptLines = lines.slice(-maxLines);
  }

  let result = keptLines.join("\n");
  let resultBytes = Buffer.byteLength(result, "utf8");

  // Further truncate by bytes if needed
  while (resultBytes > maxBytes && keptLines.length > 1) {
    keptLines = keptLines.slice(1);
    result = keptLines.join("\n");
    resultBytes = Buffer.byteLength(result, "utf8");
  }

  // Final byte truncation if single line is still too large
  if (resultBytes > maxBytes) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const encoded = encoder.encode(result);
    result = decoder.decode(encoded.slice(-maxBytes));
  }

  return {
    content: result,
    truncated: true,
    originalLines,
    keptLines: keptLines.length,
    originalBytes,
    keptBytes: Buffer.byteLength(result, "utf8"),
  };
}

type PhiExtensionAPI = {
  registerTool: (def: any) => void;
  registerCommand: (name: string, def: any) => void;
  sendMessage?: (message: any, options?: any) => void;
};

export function truncatePhiText(text: string) {
  return truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
}

function toToolResult(text: string, extra?: { details?: any; isError?: boolean }) {
  const truncation = truncatePhiText(text);
  const { content: _truncatedContent, ...truncationDetails } = truncation;

  const details = {
    ...(extra?.details ?? {}),
    ...(truncation.truncated ? { truncation: truncationDetails } : {}),
  };

  return {
    content: [{ type: "text", text: truncation.content }],
    details,
    isError: extra?.isError ?? false,
  };
}

export default function agentsboxPhiExtension(phi: PhiExtensionAPI) {
  // Thread-safe lazy runtime construction
  let runtimePromise: ReturnType<typeof createAgentsboxRuntime> | null = null;

  async function getRuntime() {
    if (!runtimePromise) {
      runtimePromise = createAgentsboxRuntime({
        packageVersion: PACKAGE_VERSION,
        configPath: process.env.AGENTSBOX_CONFIG || getDefaultAgentsboxConfigPath(),
        // In phi, we want normal side effects (auto-create config) unless in tests.
        isTestEnv: process.env.NODE_ENV === "test" || !!process.env.BUN_TEST,
      });
    }

    const r = await runtimePromise;
    if (!r.success) {
      // Allow retry if config was temporarily invalid.
      runtimePromise = null;
    }

    return r;
  }

  // -----------------
  // Tools
  // -----------------

  phi.registerTool({
    name: "agentsbox_search_bm25",
    label: "agentsbox_search_bm25",
    description: BM25_DESC,
    parameters: Type.Object({
      text: Type.String({
        description:
          "Natural language description of the tool you're looking for (e.g., 'get current time', 'search the web')",
      }),
      limit: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (default: 5)",
        }),
      ),
    }),
    async execute(_toolCallId: string, params: { text: string; limit?: number }) {
      const r = await getRuntime();
      if (!r.success)
        return toToolResult(r.errorMessage, { isError: true, details: { error: r.errorMessage } });
      const out = await r.runtime.searchBm25(params);
      return toToolResult(out);
    },
  });

  phi.registerTool({
    name: "agentsbox_search_regex",
    label: "agentsbox_search_regex",
    description: REGEX_DESC,
    parameters: Type.Object({
      pattern: Type.String({
        description: `Regex pattern to match tool names (max ${MAX_REGEX_LENGTH} chars). Examples: "time_.*", "exa_.*search.*"`,
      }),
      limit: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (default: 5)",
        }),
      ),
    }),
    async execute(_toolCallId: string, params: { pattern: string; limit?: number }) {
      const r = await getRuntime();
      if (!r.success)
        return toToolResult(r.errorMessage, { isError: true, details: { error: r.errorMessage } });
      const out = await r.runtime.searchRegex(params);
      return toToolResult(out);
    },
  });

  phi.registerTool({
    name: "agentsbox_execute",
    label: "agentsbox_execute",
    description: EXECUTE_DESC,
    parameters: Type.Object({
      toolId: Type.String({
        description:
          "Tool ID from search results. Format: {serverName}_{toolName} (e.g., 'time_get_current_time', 'brave_web_search')",
      }),
      arguments: Type.Optional(
        Type.String({
          description:
            "JSON-encoded arguments for the tool, matching its schema. Use '{}' or omit for tools with no required arguments.",
        }),
      ),
    }),
    async execute(_toolCallId: string, params: { toolId: string; arguments?: string }) {
      const r = await getRuntime();
      if (!r.success)
        return toToolResult(r.errorMessage, { isError: true, details: { error: r.errorMessage } });
      const out = await r.runtime.execute(params);
      return toToolResult(out);
    },
  });

  phi.registerTool({
    name: "agentsbox_status",
    label: "agentsbox_status",
    description: STATUS_DESC,
    parameters: Type.Object({}),
    async execute(_toolCallId: string) {
      const r = await getRuntime();
      if (!r.success)
        return toToolResult(r.errorMessage, { isError: true, details: { error: r.errorMessage } });
      const out = await r.runtime.status();
      return toToolResult(out);
    },
  });

  phi.registerTool({
    name: "agentsbox_perf",
    label: "agentsbox_perf",
    description: PERF_DESC,
    parameters: Type.Object({}),
    async execute(_toolCallId: string) {
      const r = await getRuntime();
      if (!r.success)
        return toToolResult(r.errorMessage, { isError: true, details: { error: r.errorMessage } });
      const out = await r.runtime.perf();
      return toToolResult(out);
    },
  });

  phi.registerTool({
    name: "agentsbox_test",
    label: "agentsbox_test",
    description: TEST_DESC,
    parameters: Type.Object({
      timeout: Type.Optional(
        Type.Number({ description: "Timeout per tool in ms (default: 10000)" }),
      ),
    }),
    async execute(_toolCallId: string, params: { timeout?: number }) {
      const r = await getRuntime();
      if (!r.success)
        return toToolResult(r.errorMessage, { isError: true, details: { error: r.errorMessage } });
      const out = await r.runtime.test(params);
      return toToolResult(out);
    },
  });

  // -----------------
  // Commands
  // -----------------

  phi.registerCommand("agentsbox-status", {
    description: "Show agentsbox status (without using the LLM)",
    handler: async (_args: string | undefined, ctx: any) => {
      const r = await getRuntime();
      if (!r.success) {
        ctx?.ui?.notify?.(r.errorMessage, "error");
        return;
      }
      const out = await r.runtime.status();
      if (phi.sendMessage) {
        phi.sendMessage({
          customType: "agentsbox",
          content: truncatePhiText(out).content,
          display: true,
        });
      } else {
        ctx?.ui?.notify?.("agentsbox status ready", "info");
      }
    },
  });

  phi.registerCommand("agentsbox-search", {
    description: "BM25 search agentsbox tools (without using the LLM)",
    handler: async (args: string | undefined, ctx: any) => {
      const query = (args ?? "").trim();
      if (!query) {
        ctx?.ui?.notify?.("Usage: /agentsbox-search <query>", "info");
        return;
      }

      const r = await getRuntime();
      if (!r.success) {
        ctx?.ui?.notify?.(r.errorMessage, "error");
        return;
      }

      const out = await r.runtime.searchBm25({ text: query, limit: 10 });
      if (phi.sendMessage) {
        phi.sendMessage({
          customType: "agentsbox",
          content: truncatePhiText(out).content,
          display: true,
        });
      } else {
        ctx?.ui?.notify?.("agentsbox search ready", "info");
      }
    },
  });

  phi.registerCommand("agentsbox-help", {
    description: "Show agentsbox integration help",
    handler: async (_args: string | undefined, ctx: any) => {
      const text = [
        "agentsbox (phi integration)",
        "",
        "Tools:",
        "- agentsbox_search_bm25",
        "- agentsbox_search_regex",
        "- agentsbox_execute",
        "- agentsbox_status",
        "- agentsbox_perf",
        "- agentsbox_test",
        "",
        "Commands:",
        "- /agentsbox-status",
        "- /agentsbox-search <query>",
        "- /agentsbox-help",
      ].join("\n");

      if (phi.sendMessage) {
        phi.sendMessage({
          customType: "agentsbox",
          content: truncatePhiText(text).content,
          display: true,
        });
      } else {
        ctx?.ui?.notify?.("agentsbox help ready", "info");
      }
    },
  });
}
