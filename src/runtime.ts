import { homedir } from "node:os";
import { join } from "node:path";
import type { CatalogTool, SearchResult } from "./catalog";
import type { Config, ConnectionConfig } from "./config";
import { createDefaultConfigIfMissing, loadConfig } from "./config";
import { MCPManager } from "./mcp-client";
import type { MCPClientFactory } from "./mcp-client/manager";
import { globalProfiler } from "./profiler";
import { BM25Index, MAX_REGEX_LENGTH, searchWithRegex } from "./search";

/**
 * Tool descriptions - short, directive style
 * Exported so integrations can reuse (OpenCode + pi)
 */
export const BM25_DESC = `Search the tool catalog by natural language. ALWAYS search before saying "I cannot do that."

Returns tools with schemas. Use agentsbox_execute() to run them.`;

export const REGEX_DESC = `Search the tool catalog by regex pattern on tool names. ALWAYS search before saying "I cannot do that."

Use when you know part of a tool name or server prefix (e.g., "time_.*", "exa_.*search.*").

Returns tools with schemas. Use agentsbox_execute() to run them.`;

export const EXECUTE_DESC = `Execute a tool discovered via agentsbox_search_bm25 or agentsbox_search_regex.

Pass arguments as JSON string matching the tool's schema.
toolId format: {serverName}_{toolName}`;

export const STATUS_DESC = `Get agentsbox status including plugin initialization, MCP server connections, and tool counts.

Shows success/total metrics to highlight failures. Use to check if agentsbox is working correctly.`;

export const PERF_DESC = `Get detailed performance metrics for agentsbox.

Shows initialization times, search latencies, execution stats, and per-server metrics.`;

export const TEST_DESC = `Test all agentsbox tools with minimal predefined prompts.

Executes every registered tool with super simple inputs to verify they work. Returns pass/fail for each tool.`;

/**
 * Predefined minimal test prompts for known tools
 * Format: toolIdString -> minimal arguments object
 */
const TEST_PROMPTS: Record<string, Record<string, unknown>> = {
  // Time tools
  time_get_current_time: {},
  time_convert_time: {
    source_timezone: "UTC",
    time: "12:00",
    target_timezone: "America/New_York",
  },

  // Brave search tools - minimal queries
  brave_brave_web_search: { query: "test", count: 1 },
  brave_brave_local_search: { query: "coffee", count: 1 },
  brave_brave_video_search: { query: "test", count: 1 },
  brave_brave_image_search: { query: "test", count: 1 },
  brave_brave_news_search: { query: "test", count: 1 },
  brave_brave_summarizer: { key: "test" },

  // Brightdata tools
  brightdata_search_engine: { query: "hello", engine: "google", count: 1 },
  brightdata_search_engine_batch: {
    queries: [{ query: "test", engine: "google", count: 1 }],
  },
  brightdata_scrape_as_markdown: { url: "https://example.com" },
  brightdata_scrape_as_html: { url: "https://example.com" },
  brightdata_scrape_batch: { urls: ["https://example.com"] },
  brightdata_extract: { url: "https://example.com" },
  brightdata_session_stats: {},
  brightdata_web_data_reuter_news: {
    url: "https://www.reuters.com/technology/",
  },
  brightdata_web_data_github_repository_file: {
    url: "https://github.com/octocat/Hello-World/blob/master/README",
  },

  // Tavily tools - minimal queries
  "tavily_tavily-search": { query: "test", maxResults: 1 },
  "tavily_tavily-extract": { urls: ["https://example.com"] },
  "tavily_tavily-map": { url: "https://example.com" },

  // Context7 tools
  "context7_resolve-library-id": { libraryName: "react" },

  // Octocode GitHub tools - minimal queries
  octocode_githubSearchRepositories: { query: "test", maxResults: 1 },
  octocode_githubSearchCode: { query: "function test", maxResults: 1 },
  octocode_githubViewRepoStructure: { owner: "octocat", repo: "Hello-World" },

  // Perplexity tools - minimal queries
  perplexity_perplexity_ask: { query: "What is 1+1?" },
  perplexity_perplexity_search: { query: "test", maxResults: 1 },
};

/**
 * Generate minimal arguments from a JSON schema
 * Used as fallback when no predefined test prompt exists
 */
function generateMinimalArgs(schema: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  if (schema.type !== "object" || !schema.properties) {
    return args;
  }

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = (schema.required as string[]) || [];

  // Only fill in required properties with minimal values
  for (const propName of required) {
    const prop = properties[propName];
    if (!prop) continue;

    const enumValues = prop.enum as unknown[] | undefined;

    switch (prop.type) {
      case "string":
        args[propName] = prop.default ?? enumValues?.[0] ?? "test";
        break;
      case "number":
      case "integer":
        args[propName] = prop.default ?? prop.minimum ?? 1;
        break;
      case "boolean":
        args[propName] = prop.default ?? false;
        break;
      case "array":
        args[propName] = prop.default ?? [];
        break;
      case "object":
        args[propName] = prop.default ?? {};
        break;
      default:
        args[propName] = prop.default ?? null;
    }
  }

  return args;
}

/**
 * Parse tool name into server and original tool name
 * Format: "serverName_toolName" where serverName MUST NOT contain underscores.
 *
 * Note: MCP server names come from config keys. We enforce this constraint at runtime init
 * because '_' is used as the toolId delimiter.
 */
export function parseToolId(fullName: string): { serverName: string; toolName: string } | null {
  const underscoreIndex = fullName.indexOf("_");
  if (underscoreIndex <= 0 || underscoreIndex === fullName.length - 1) return null;

  const serverName = fullName.substring(0, underscoreIndex);
  const toolName = fullName.substring(underscoreIndex + 1);

  if (!serverName || !toolName) return null;

  return { serverName, toolName };
}

/**
 * Format search results for LLM consumption
 */
export function formatSearchResults(results: SearchResult[], allTools: CatalogTool[]): string {
  const toolMap = new Map(allTools.map((t) => [t.idString, t]));

  const output = {
    count: results.length,
    tools: results.map((r) => {
      const catalogTool = toolMap.get(r.idString);
      return {
        name: r.idString,
        description: catalogTool?.description || r.preview,
        score: r.score,
        schema: catalogTool?.inputSchema || null,
      };
    }),
    usage:
      "Use agentsbox_execute({ toolId: '<toolId>', arguments: '<json>' }) to run a discovered tool",
  };

  return JSON.stringify(output, null, 2);
}

export function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}

export function getDefaultAgentsboxConfigPath(): string {
  return join(getXdgConfigHome(), "agentsbox", "config.jsonc");
}

export type AgentsboxRuntimeOptions = {
  /** Package version used when auto-creating config file */
  packageVersion: string;
  /** Override config path, otherwise uses env AGENTSBOX_CONFIG or XDG default */
  configPath?: string;
  /** Dependency injection for tests */
  mcpClientFactory?: MCPClientFactory;
  /** Override connection settings */
  connectionConfig?: ConnectionConfig;
  /** Skip auto-create config and side effects */
  isTestEnv?: boolean;
};

export type AgentsboxRuntime = {
  configPath: string;
  config: Config;
  serverNames: string[];
  initMode: "eager" | "lazy";
  connectionConfig: ConnectionConfig;
  mcpManager: MCPManager;
  bm25Index: BM25Index;

  ensureInitialized: () => Promise<void>;

  searchBm25: (args: { text: string; limit?: number }) => Promise<string>;
  searchRegex: (args: { pattern: string; limit?: number }) => Promise<string>;
  execute: (args: { toolId: string; arguments?: string }) => Promise<string>;
  status: () => Promise<string>;
  perf: () => Promise<string>;
  test: (args: { timeout?: number }) => Promise<string>;
};

export type CreateRuntimeResult =
  | { success: true; runtime: AgentsboxRuntime }
  | { success: false; errorMessage: string; configPath: string };

/**
 * Generate system prompt with configured MCP server names
 * Uses XML format for token-efficient AI parsing
 */
export function generateSystemPrompt(configuredServers: string[]): string {
  const registry =
    configuredServers.length > 0
      ? configuredServers.map((s) => `${s}_*`).join("\n")
      : "(no servers configured)";

  return `
<MCPTools>
  <Rules>
    ALWAYS agentsbox_search_* before saying "I cannot do that" or "I don't have access to"
    ALWAYS agentsbox_search_* if user wants to use tools or refers to unknown tool names
  </Rules>
  <MCPServers>
    <Registry>
      ${registry}
    </Registry>
    <NamingConvention>
      serverName: MCP server name
      toolName: tool name provided by MCP server
      toolId: {serverName}_{toolName}
    </NamingConvention>
    <Patterns>
      ALL: ".*"
      SERVER: "{serverName}_.*"
      TOOL: "{serverName}_{toolName}"
    </Patterns>
    <Discovery>
      <ListAllTools>
        agentsbox_search_regex({ pattern: ".*" })
      </ListAllTools>
      <ServerTools>
        agentsbox_search_regex({ pattern: "serverName_.*" })
      </ServerTools>
      <FreeSearch>
        agentsbox_search_bm25({ text: "description keywords" })
      </FreeSearch>
    </Discovery>
    <Execute>
      agentsbox_execute({ toolId: "toolId", arguments: '{}' })
    </Execute>
    <When>
      regex: know server name or partial tool name
      bm25: know what you want to do, not tool name
    </When>
    <Fallback>
      agentsbox_search_regex → agentsbox_search_bm25 → agentsbox_status → ask user
    </Fallback>
    <Troubleshoot>
      If tool not found: check server prefix, try bm25 with descriptive text
      Check server health: agentsbox_status()
    </Troubleshoot>
  </MCPServers>
</MCPTools>`;
}

export async function createAgentsboxRuntime(
  opts: AgentsboxRuntimeOptions,
): Promise<CreateRuntimeResult> {
  const isTestEnv = opts.isTestEnv ?? (process.env.NODE_ENV === "test" || !!process.env.BUN_TEST);

  const configPath =
    opts.configPath ?? process.env.AGENTSBOX_CONFIG ?? getDefaultAgentsboxConfigPath();

  if (!isTestEnv) {
    await createDefaultConfigIfMissing(configPath, opts.packageVersion);
  }

  const configResult = await loadConfig(configPath);
  if (!configResult.success) {
    const formattedErrors = configResult.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `at "${issue.path.join(".")}"` : "";
        return `${issue.message} ${path}`.trim();
      })
      .join("; ");

    return {
      success: false,
      configPath,
      errorMessage: `Failed to load config from ${configPath}: ${formattedErrors}`,
    };
  }

  const config = configResult.data;

  // Tool IDs use '_' as delimiter: {serverName}_{toolName}
  // Enforce serverName without underscores to keep parsing unambiguous.
  const invalidServerNames = Object.keys(config.mcp).filter((name) => name.includes("_"));
  if (invalidServerNames.length > 0) {
    return {
      success: false,
      configPath,
      errorMessage:
        `Invalid MCP server name(s): ${invalidServerNames.join(", ")}. ` +
        `Server names must not contain '_' because toolId format is {serverName}_{toolName}.`,
    };
  }

  const initMode = config.settings?.initMode || "eager";
  const connectionConfig: ConnectionConfig = {
    connectTimeout: config.settings?.connection?.connectTimeout || 5000,
    requestTimeout: config.settings?.connection?.requestTimeout || 30000,
    retryAttempts: config.settings?.connection?.retryAttempts || 2,
    retryDelay: config.settings?.connection?.retryDelay || 1000,
    ...opts.connectionConfig,
  };

  const mcpManager = new MCPManager({
    connectionConfig,
    clientFactory: opts.mcpClientFactory,
  });
  const bm25Index = new BM25Index();

  // Metrics
  let searchCount = 0;
  let executionCount = 0;
  let executionSuccessCount = 0;

  // Index progressively as servers connect
  mcpManager.on("server:connected", (_serverName, tools) => {
    bm25Index.addToolsBatch(tools);
    globalProfiler.recordIncrementalUpdate(tools.length);
  });

  // Eager init starts immediately, non-blocking
  if (initMode === "eager") {
    mcpManager.initializeBackground(config.mcp);
  }

  // Thread-safe initialization guard (only one ensure in flight)
  let ensurePromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (mcpManager.isReady()) return;
    if (ensurePromise) return ensurePromise;

    ensurePromise = (async () => {
      if (mcpManager.isReady()) return;

      if (initMode === "lazy" && mcpManager.getInitState() === "idle") {
        await mcpManager.initialize(config.mcp);
        return;
      }

      await mcpManager.waitForPartial();
    })().finally(() => {
      ensurePromise = null;
    });

    return ensurePromise;
  }

  const serverNames = Object.keys(config.mcp);

  async function searchBm25(args: { text: string; limit?: number }): Promise<string> {
    const timer = globalProfiler.startTimer("search.bm25");

    try {
      await ensureInitialized();
    } catch (error) {
      timer();
      return JSON.stringify({
        success: false,
        error: `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    searchCount++;
    const rawLimit = args.limit ?? config.settings?.defaultLimit ?? 5;
    const searchLimit = Math.max(1, Math.min(rawLimit, 50));
    const allTools = mcpManager.getAllCatalogTools();
    const results = bm25Index.search(args.text, searchLimit);
    timer();
    return formatSearchResults(results, allTools);
  }

  async function searchRegex(args: { pattern: string; limit?: number }): Promise<string> {
    const timer = globalProfiler.startTimer("search.regex");

    try {
      await ensureInitialized();
    } catch (error) {
      timer();
      return JSON.stringify({
        success: false,
        error: `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    searchCount++;
    const rawLimit = args.limit ?? config.settings?.defaultLimit ?? 5;
    const searchLimit = Math.max(1, Math.min(rawLimit, 50));
    const allTools = mcpManager.getAllCatalogTools();
    const result = searchWithRegex(allTools, args.pattern, searchLimit);

    if ("error" in result) {
      timer();
      return JSON.stringify({ success: false, error: result.error });
    }

    timer();
    return formatSearchResults(result, allTools);
  }

  async function execute(args: { toolId: string; arguments?: string }): Promise<string> {
    const timer = globalProfiler.startTimer("tool.execute");

    try {
      await ensureInitialized();
    } catch (error) {
      timer();
      return JSON.stringify({
        success: false,
        error: `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    const parsed = parseToolId(args.toolId);
    if (!parsed) {
      timer();
      return JSON.stringify({
        success: false,
        error: `Invalid toolId format: ${args.toolId}. Expected format: {serverName}_{toolName} (e.g., 'time_get_current_time')`,
      });
    }

    let toolArgs: Record<string, unknown> = {};
    if (args.arguments) {
      try {
        toolArgs = JSON.parse(args.arguments);
      } catch (error) {
        timer();
        return JSON.stringify({
          success: false,
          error: `Failed to parse arguments as JSON: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    executionCount++;

    try {
      const result = await mcpManager.callTool(parsed.serverName, parsed.toolName, toolArgs);
      executionSuccessCount++;
      timer();
      return JSON.stringify({ success: true, result });
    } catch (error) {
      timer();
      const errorMsg = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;

      const server = mcpManager.getServer(parsed.serverName);
      const configuredServer = config.mcp[parsed.serverName];

      const serverInfo = server
        ? {
            name: server.name,
            status: server.status,
            type: server.config.type,
            error: server.error || null,
            command: server.config.type === "local" ? server.config.command || null : undefined,
            commandString:
              server.config.type === "local" && server.config.command
                ? server.config.command.join(" ")
                : undefined,
            url: server.config.type === "remote" ? server.config.url || null : undefined,
          }
        : configuredServer
          ? {
              name: parsed.serverName,
              status: "unknown",
              type: configuredServer.type,
              error: null,
              command:
                configuredServer.type === "local" ? configuredServer.command || null : undefined,
              commandString:
                configuredServer.type === "local" && configuredServer.command
                  ? configuredServer.command.join(" ")
                  : undefined,
              url: configuredServer.type === "remote" ? configuredServer.url || null : undefined,
            }
          : {
              name: parsed.serverName,
              status: "unknown",
              type: "unknown",
              error: null,
            };

      return JSON.stringify({ success: false, error: errorMsg, server: serverInfo });
    }
  }

  async function status(): Promise<string> {
    if (!mcpManager.isReady()) {
      try {
        await ensureInitialized();
      } catch (error) {
        return JSON.stringify({
          status: "error",
          message: "Failed to initialize agentsbox",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const servers = mcpManager.getAllServers();
    const connectedServers = servers.filter((s) => s.status === "connected");
    const failedServers = servers.filter((s) => s.status === "error");
    const connectingServers = servers.filter((s) => s.status === "connecting");
    const totalTools = mcpManager.getAllCatalogTools().length;
    const initDuration = globalProfiler.getInitDuration();

    const result = {
      plugin: {
        initialized: mcpManager.isComplete(),
        initState: mcpManager.getInitState(),
        initMode,
        initDurationMs: initDuration ? Math.round(initDuration) : null,
        configPath,
        uptime: process.uptime(),
        searches: searchCount,
        executions: executionCount,
        successRate:
          executionCount > 0
            ? `${Math.round((executionSuccessCount / executionCount) * 100)}%`
            : "N/A",
      },
      servers: {
        total: servers.length,
        connected: connectedServers.length,
        failed: failedServers.length,
        connecting: connectingServers.length,
        connectionRatio: `${connectedServers.length}/${servers.length}`,
        details: servers.map((server) => ({
          name: server.name,
          status: server.status,
          type: server.config.type,
          toolCount: server.tools.length,
          error: server.error || null,
          command: server.config.type === "local" ? server.config.command || null : undefined,
          commandString:
            server.config.type === "local" && server.config.command
              ? server.config.command.join(" ")
              : undefined,
          url: server.config.type === "remote" ? server.config.url || null : undefined,
          healthy: server.status === "connected",
        })),
      },
      tools: {
        total: totalTools,
        indexed: bm25Index.size,
        serversWithTools: servers.filter((s) => s.tools.length > 0).length,
      },
      agentsboxTools: [
        "agentsbox_search_bm25",
        "agentsbox_search_regex",
        "agentsbox_execute",
        "agentsbox_status",
        "agentsbox_perf",
        "agentsbox_test",
      ],
      health: {
        status:
          failedServers.length === 0 && servers.length > 0
            ? "healthy"
            : failedServers.length > 0
              ? "degraded"
              : "unknown",
        message:
          servers.length === 0
            ? "No servers configured"
            : failedServers.length === 0
              ? "All servers connected"
              : `${failedServers.length} server(s) failed to connect`,
      },
    };

    return JSON.stringify(result, null, 2);
  }

  async function perf(): Promise<string> {
    const report = globalProfiler.export();

    return JSON.stringify(
      {
        ...report,
        indexStats: bm25Index.getStats(),
        config: {
          initMode,
          connectionTimeout: connectionConfig.connectTimeout,
          requestTimeout: connectionConfig.requestTimeout,
          retryAttempts: connectionConfig.retryAttempts,
        },
      },
      null,
      2,
    );
  }

  async function testTool(args: { timeout?: number }): Promise<string> {
    const startTime = performance.now();
    const output: string[] = [];

    output.push("=".repeat(80));
    output.push("TOOLBOX TEST - Full Execution Log");
    output.push("=".repeat(80));
    output.push("");

    try {
      await ensureInitialized();
    } catch (error) {
      output.push(
        `[FATAL] Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
      );
      return output.join("\n");
    }

    const allTools = mcpManager.getAllCatalogTools();
    const timeout = args.timeout || 10000;

    output.push(`[INFO] Found ${allTools.length} tools to test`);
    output.push(`[INFO] Timeout per tool: ${timeout}ms`);
    output.push(`[INFO] Started at: ${new Date().toISOString()}`);
    output.push("");

    let passed = 0;
    let failed = 0;
    let timedOut = 0;
    let skipped = 0;

    for (let i = 0; i < allTools.length; i++) {
      const catalogTool = allTools[i]!;
      const toolId = catalogTool.idString;
      const testNum = i + 1;

      output.push("-".repeat(80));
      output.push(`[TEST ${testNum}/${allTools.length}] ${toolId}`);
      output.push("-".repeat(80));

      const parsed = parseToolId(toolId);
      if (!parsed) {
        output.push(`[SKIP] Invalid tool name format`);
        output.push("");
        skipped++;
        continue;
      }

      output.push(`[INFO] Server: ${parsed.serverName}`);
      output.push(`[INFO] Tool: ${parsed.toolName}`);
      output.push(`[INFO] Description: ${catalogTool.description || "(no description)"}`);
      output.push("");

      let testArgs: Record<string, unknown>;
      let argsSource: string;

      const predefinedArgs = TEST_PROMPTS[toolId];
      if (predefinedArgs !== undefined) {
        testArgs = predefinedArgs;
        argsSource = "PREDEFINED";
      } else {
        testArgs = generateMinimalArgs(catalogTool.inputSchema);
        argsSource = Object.keys(testArgs).length > 0 ? "GENERATED" : "EMPTY";
      }

      output.push(`[INPUT] Arguments source: ${argsSource}`);
      output.push(`[INPUT] Request payload:`);
      output.push(
        JSON.stringify(testArgs, null, 2)
          .split("\n")
          .map((line) => "        " + line)
          .join("\n"),
      );
      output.push("");

      const toolStart = performance.now();

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("TIMEOUT")), timeout);
        });

        const execPromise = mcpManager.callTool(parsed.serverName, parsed.toolName, testArgs);

        const result = await Promise.race([execPromise, timeoutPromise]);
        const duration = Math.round(performance.now() - toolStart);

        output.push(`[OUTPUT] Response received in ${duration}ms:`);
        const resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        output.push(
          resultStr
            .split("\n")
            .map((line) => "        " + line)
            .join("\n"),
        );
        output.push("");
        output.push(`[PASS] ✓ Test passed in ${duration}ms`);
        passed++;
      } catch (error) {
        const duration = Math.round(performance.now() - toolStart);
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg === "TIMEOUT") {
          output.push(`[OUTPUT] No response - timed out after ${timeout}ms`);
          output.push("");
          output.push(`[TIMEOUT] ✗ Test timed out after ${duration}ms`);
          timedOut++;
        } else {
          output.push(`[OUTPUT] Error response:`);
          output.push(`        ${errorMsg}`);
          output.push("");
          output.push(`[FAIL] ✗ Test failed in ${duration}ms`);
          output.push(`[FAIL] Error: ${errorMsg}`);
          failed++;
        }
      }

      output.push("");
    }

    const totalDuration = Math.round(performance.now() - startTime);
    const total = allTools.length;
    const successRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    output.push("=".repeat(80));
    output.push("TEST SUMMARY");
    output.push("=".repeat(80));
    output.push("");
    output.push(`Total tests:    ${total}`);
    output.push(`Passed:         ${passed} ✓`);
    output.push(`Failed:         ${failed} ✗`);
    output.push(`Timed out:      ${timedOut} ⏱`);
    output.push(`Skipped:        ${skipped} ⊘`);
    output.push("");
    output.push(`Success rate:   ${successRate}%`);
    output.push(`Total duration: ${totalDuration}ms`);
    output.push(`Finished at:    ${new Date().toISOString()}`);
    output.push("");
    output.push("=".repeat(80));

    return output.join("\n");
  }

  return {
    success: true,
    runtime: {
      configPath,
      config,
      serverNames,
      initMode,
      connectionConfig,
      mcpManager,
      bm25Index,
      ensureInitialized,
      searchBm25,
      searchRegex,
      execute,
      status,
      perf,
      test: testTool,
    },
  };
}

export { MAX_REGEX_LENGTH };
