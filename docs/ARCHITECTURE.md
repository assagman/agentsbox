# agentsbox Architecture

This document provides a deep dive into agentsbox's architecture.

---

## Overview

**agentsbox** implements the "tool search tool" pattern for MCP: instead of exposing all MCP server tools to the LLM context up-front, it exposes a small, stable set of `agentsbox_*` tools that search and execute MCP server tools on-demand.

### Key Goals

1. **Reduce context bloat** – Only 6 tools always visible to LLM
2. **Maintain full tool access** – All MCP tools available via search
3. **Agent-agnostic** – Works with OpenCode, pi, and other frameworks
4. **Thread-safe** – Safe for concurrent use
5. **Zero-config default** – Auto-creates minimal config on first run

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AGENT RUNTIME                                 │
│                            (OpenCode / pi)                             │
│                                                                          │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐     │
│  │  Built-in Tools  │   │  agentsbox Tools  │   │  Custom Tools   │     │
│  │  (read, bash...) │   │  (search/exec)    │   │  (user-provided)│     │
│  └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘     │
│           │                       │                      │              │
│           └───────────────────────┼──────────────────────┘              │
│                                   ▼                                     │
│                    ┌──────────────────────────┐                          │
│                    │     Tool Registry        │                          │
│                    │  (unified tool list)     │                          │
│                    └──────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Plugin/Extension API
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         agentsbox Runtime                                │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         Tool Surface                             │   │
│  │  • agentsbox_search_bm25                                        │   │
│  │  • agentsbox_search_regex                                       │   │
│  │  • agentsbox_execute                                            │   │
│  │  • agentsbox_status                                             │   │
│  │  • agentsbox_perf                                               │   │
│  │  • agentsbox_test                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         Search Layer                             │   │
│  │  • BM25Index (semantic search)                                 │   │
│  │  • regex search (pattern-based)                               │   │
│  │  • result formatting for LLMs                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       Catalog Layer                              │   │
│  │  • Unified tool catalog from all servers                        │   │
│  │  • Tool indexing on server connect                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        MCP Manager                               │   │
│  │  • Connection management (eager/lazy)                            │   │
│  │  • Tool call routing                                            │   │
│  │  • Error handling & retries                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                     │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
│  │ Local MCP    │         │ Remote MCP   │         │ ...          │   │
│  │ Server       │         │ Server       │         │              │   │
│  │ (stdio)      │         │ (HTTP/SSE)   │         │              │   │
│  └──────────────┘         └──────────────┘         └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                         ┌─────────────────┐
                         │  Config File    │
                         │  config.jsonc   │
                         └─────────────────┘
```

---

## Component Deep Dive

### 1. Tool Surface (src/runtime.ts)

The 6 exported tools provide the complete interface:

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `agentsbox_search_bm25` | Semantic search | `{ text, limit? }` | Matching tools + schemas |
| `agentsbox_search_regex` | Pattern search | `{ pattern, limit? }` | Matching tools + schemas |
| `agentsbox_execute` | Execute tool | `{ toolId, arguments? }` | Tool result or error |
| `agentsbox_status` | Get status | `{}` | Server/health metrics |
| `agentsbox_perf` | Get perf | `{}` | Timing/latency metrics |
| `agentsbox_test` | Test tools | `{ timeout? }` | Pass/fail results |

**Thread safety:** Runtime uses a lazy initialization pattern with promise-based guards.

---

### 2. Search Layer (src/search/)

#### BM25Index

Implements BM25 algorithm for semantic search:

```typescript
class BM25Index {
  addToolsBatch(tools: CatalogTool[]): void
  search(query: string, limit: number): SearchResult[]
  getStats(): IndexStats
}
```

**Key characteristics:**
- Indexes tool names and descriptions
- Returns results with relevance scores
- Incrementally updates as servers connect

#### Regex Search

Simple pattern matching on tool names:

```typescript
function searchWithRegex(
  tools: CatalogTool[],
  pattern: string,
  limit: number
): SearchResult[] | { error: string }
```

**Use cases:**
- Known server prefix: `"time_.*"`
- Known partial name: `"web.*search"`
- List all tools: `".*"`

---

### 3. Catalog Layer (src/catalog/)

Unified representation of tools from all MCP servers:

```typescript
interface CatalogTool {
  idString: string;           // "{serverName}_{toolName}"
  serverName: string;
  name: string;
  description: string;
  inputSchema: JSONSchema;
}
```

**Indexing flow:**
1. MCP server connects
2. Server emits `tools` list
3. Tools converted to `CatalogTool` format
4. Tools added to BM25Index
5. Search becomes available

---

### 4. MCP Manager (src/mcp-client/manager.ts)

Centralized connection and call management:

```typescript
class MCPManager {
  // Connection management
  initialize(servers: Config["mcp"]): Promise<void>
  initializeBackground(servers: Config["mcp"]): void
  waitForPartial(): Promise<void>

  // Tool calls
  callTool(serverName: string, toolName: string, args: unknown): Promise<unknown>

  // State queries
  getAllCatalogTools(): CatalogTool[]
  getAllServers(): ServerInfo[]
  isReady(): boolean
  isComplete(): boolean
}
```

**Connection types:**

| Type | Transport | Example |
|------|-----------|---------|
| Local | stdio | `uvx mcp-server-time` |
| Remote | HTTP/SSE | `https://mcp.tavily.com/mcp/` |

**Lifecycle states:**
```
idle → connecting → connected
  ↘                      ↘
   (lazy init)         (tools indexed)
```

**Eager vs Lazy init:**

```
Eager Mode:
plugin_load → initializeBackground() → connect all servers (non-blocking)
             └─ search waits for partial → ready

Lazy Mode:
plugin_load → (nothing)
search → initialize() → connect servers (blocking) → ready
```

---

### 5. Configuration (src/config/)

**Config schema:**

```typescript
interface Config {
  "$schema"?: string;
  mcp: Record<string, MCPServerConfig>;
  settings?: Settings;
}

interface MCPServerConfig {
  type: "local" | "remote";
  // local:
  command?: string[];
  environment?: Record<string, string>;
  // remote:
  url?: string;
  headers?: Record<string, string>;
}

interface Settings {
  defaultLimit?: number;
  initMode?: "eager" | "lazy";
  connection?: ConnectionConfig;
}
```

**Environment interpolation:**

```jsonc
{
  "mcp": {
    "my-server": {
      "type": "remote",
      "url": "{env:MCP_URL}",
      "headers": {
        "Authorization": "Bearer {env:API_TOKEN}"
      }
    }
  }
}
```

---

## Request Flow

### Flow 1: Tool Discovery and Execution

```
User: "What time is it in Tokyo?"
    │
    ▼
┌─────────┐
│   LLM   │
└────┬────┘
     │
     │ Needs to find time tool
     ▼
agentsbox_search_bm25({
  text: "get current time"
})
     │
     ▼
┌─────────────────┐
│  Search Layer   │ → BM25 search
└────────┬────────┘
         │ Returns: [ "time_get_current_time", ... ]
         │
         ▼
┌─────────────────┐
│  Execute Layer  │
└────────┬────────┘
         │
         ▼
agentsbox_execute({
  toolId: "time_get_current_time",
  arguments: '{"timezone":"Asia/Tokyo"}'
})
         │
         ▼
┌─────────────────┐
│   MCP Manager   │ → parseToolId() → server="time", tool="get_current_time"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Time MCP       │ → execute tool
│  Server         │
└────────┬────────┘
         │ Returns: { "time": "10:30 PM", ... }
         │
         ▼
┌─────────────────┐
│   LLM Response  │ "The time in Tokyo is 10:30 PM"
└─────────────────┘
```

### Flow 2: Error Handling

```
agentsbox_execute({ toolId: "invalid_tool" })
         │
         ▼
parseToolId("invalid_tool")
         │
         ▼ Returns null
         │
         ▼
JSON.stringify({
  success: false,
  error: "Invalid toolId format: invalid_tool. Expected format: {serverName}_{toolName}"
})
         │
         ▼
┌─────────────────┐
│   LLM           │ → Uses error to format helpful response
└─────────────────┘
```

---

## System Prompt Generation

The runtime generates an XML-formatted system prompt for LLMs:

```typescript
generateSystemPrompt(configuredServers: string[]): string
```

**Output example:**

```xml
<MCPTools>
  <Rules>
    ALWAYS agentsbox_search_* before saying "I cannot do that" or "I don't have access to"
    ALWAYS agentsbox_search_* if user wants to use tools or refers to unknown tool names
  </Rules>
  <MCPServers>
    <Registry>
      time_*
      tavily_*
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
      <ListAllTools>agentsbox_search_regex({ pattern: ".*" })</ListAllTools>
      <ServerTools>agentsbox_search_regex({ pattern: "serverName_.*" })</ServerTools>
      <FreeSearch>agentsbox_search_bm25({ text: "description keywords" })</FreeSearch>
    </Discovery>
    <Execute>agentsbox_execute({ toolId: "toolId", arguments: '{}' })</Execute>
    <When>
      regex: know server name or partial tool name
      bm25: know what you want to do, not tool name
    </When>
    <Fallback>agentsbox_search_regex → agentsbox_search_bm25 → agentsbox_status → ask user</Fallback>
    <Troubleshoot>
      If tool not found: check server prefix, try bm25 with descriptive text
      Check server health: agentsbox_status()
    </Troubleshoot>
  </MCPServers>
</MCPTools>
```

---

## Threading and Concurrency

### Initialization Guard

```typescript
let ensurePromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (mcpManager.isReady()) return;
  if (ensurePromise) return ensurePromise;  // Reuse in-flight init

  ensurePromise = (async () => {
    // ... init logic ...
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}
```

**Behavior:**
- Multiple concurrent searches share one initialization
- Only one connection attempt per server
- Thread-safe by design (single event loop)

---

## Performance Considerations

### Search Latency

| Operation | Typical Latency |
|-----------|-----------------|
| BM25 search | < 10ms |
| Regex search | < 5ms |
| Tool execution | 50-500ms (depends on server) |

### Memory Usage

| Component | Memory (per 100 tools) |
|-----------|------------------------|
| Catalog | ~50KB |
| BM25 Index | ~100KB |
| MCP Client (per server) | ~1MB |

### Optimization Tips

1. **Use eager init** for tools needed immediately
2. **Use regex search** when you know the server prefix
3. **Limit search results** with smaller `limit` parameter
4. **Set appropriate timeouts** in config for slow servers

---

## Error Handling Strategy

### Error Categories

| Category | Example | User Action |
|----------|---------|-------------|
| Invalid config | Schema validation fails | Fix config.jsonc |
| Connection failed | Server unreachable | Check server, network |
| Tool not found | Invalid toolId | Use search to find correct name |
| Execution failed | Tool returned error | Check arguments, server status |

### Error Response Format

```json
{
  "success": false,
  "error": "Descriptive message",
  "server": {
    "name": "serverName",
    "status": "error",
    "type": "local|remote",
    "error": "Server-specific error"
  }
}
```

---

## Extension Points

### Adding a New Tool Type

1. Add to `CatalogTool` type (if needed)
2. Extend `MCPManager.callTool()` to handle new type
3. Update search indexing (if needed)
4. Add tests

### Adding a New Integration

1. Create `src/myagent.ts`
2. Implement tool registration using agent's API
3. Add package export in `package.json`
4. Add CLI setup command in `cli.ts`

---

## Security Considerations

1. **Environment variables** – Sensitive data via `{env:VAR}` only
2. **Server commands** – No shell injection, use structured arrays
3. **Remote URLs** – User-controlled, HTTPS recommended
4. **Tool arguments** – Parsed as JSON, validated by MCP server

---

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [BM25 Algorithm](https://en.wikipedia.org/wiki/Okapi_BM25)
- [Development Guide](./DEVELOPMENT.md)
- [Configuration Reference](./CONFIG.md)
