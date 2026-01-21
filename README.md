# agentsbox (Tool Search Tool)

[![npm version](https://badge.fury.io/js/agentsbox.svg)](https://www.npmjs.com/package/agentsbox)
[![npm downloads](https://img.shields.io/npm/dm/agentsbox)](https://www.npmjs.com/package/agentsbox)
[![license](https://img.shields.io/npm/l/agentsbox)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Build Status](https://github.com/assagman/agentsbox/actions/workflows/ci.yml/badge.svg)](https://github.com/assagman/agentsbox/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/assagman/agentsbox/branch/main/graph/badge.svg)](https://codecov.io/gh/assagman/agentsbox)

An OpenCode plugin that implements a **tool search tool** pattern, allowing users to keep only a tiny set of tools in LLM context while accessing a larger MCP catalog on-demand.

## Motivation

OpenCode's MCP servers add tool schemas to LLM context at session start. With many MCPs, this can front-load tens of thousands of tokens, reducing "smart zone" capacity and degrading speed/accuracy.

agentsbox solves this by:
- Exposing **a few toolbox tools** instead of 50+ MCP tools
- Search for tools using natural language (BM25) or regex patterns
- Execute discovered tools through the same interface
- Tool schemas are returned in search results for accurate LLM usage

## Configuration

### 1. Install OpenCode plugin (auto-loaded)

`agentsbox` is intentionally **not** an OpenCode plugin at the package root. To use it with OpenCode, install a local shim plugin into OpenCode’s plugin folder:

```bash
agentsbox init
agentsbox setup opencode
```

Notes:
- `agentsbox setup opencode` **always prints a plan first** and asks for confirmation before changing anything.
- The plugin file is installed under:
  - `~/.config/opencode/plugins/agentsbox.js`
- OpenCode auto-loads files from `~/.config/opencode/plugins/`.

If you previously used `opencode-toolbox`, remove/disable it from the `plugin` list in `~/.config/opencode/opencode.jsonc`.

### 2. Configure agentsbox

Create `~/.config/agentsbox/config.jsonc`:

```jsonc
{
  "$schema": "https://unpkg.com/agentsbox@latest/agentsbox.schema.json",
  "mcp": {
    "time": {
      "type": "local",
      "command": ["npx", "-y", "@anthropic/mcp-time"]
    },
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@anthropic/mcp-github"],
      "environment": {
        "GITHUB_TOKEN": "{env:GITHUB_TOKEN}"
      }
    },
    "weather": {
      "type": "remote",
      "url": "https://mcp.example.com/weather",
      "headers": {
        "Authorization": "Bearer {env:WEATHER_API_KEY}"
      }
    }
  },
  "settings": {
    "defaultLimit": 5
  }
}
```

> **Note:** The config file is auto-created with default settings if it doesn't exist.
>
> If you previously used `opencode-toolbox`, copy the **`mcp` section** from `~/.config/opencode/toolbox.jsonc` into `~/.config/agentsbox/config.jsonc` (no migration is performed).

### Environment Variables

- `AGENTSBOX_CONFIG`: Path to config file (default: `~/.config/agentsbox/config.jsonc`)
- Environment variable interpolation: Use `{env:VAR_NAME}` in config values

## Usage

The plugin exposes five tools:

### agentsbox_search_bm25

Search for tools using natural language:

```
agentsbox_search_bm25({ text: "get current time in timezone" })
```

### agentsbox_search_regex

Search for tools using regex patterns on tool names:

```
agentsbox_search_regex({ pattern: "time_.*", limit: 5 })
```

### Search Results

Both search tools return tool schemas so the LLM knows exact parameters:

```json
{
  "count": 1,
  "tools": [
    {
      "name": "time_get_current_time",
      "description": "Get current time in a specific timezone",
      "score": 0.87,
      "schema": {
        "type": "object",
        "properties": {
          "timezone": {
            "type": "string",
            "description": "IANA timezone name (e.g., 'America/New_York')"
          }
        },
        "required": ["timezone"]
      }
    }
  ],
  "usage": "Use agentsbox_execute({ toolId: '<toolId>', arguments: '<json>' }) to run a discovered tool"
}
```

### agentsbox_execute

Execute a discovered tool with JSON-encoded arguments. The `toolId` format is `{serverName}_{toolName}`:

```
agentsbox_execute({ toolId: "time_get_current_time", arguments: '{"timezone": "Asia/Tokyo"}' })
```

## Example Flow

```
User: "What time is it in Tokyo?"

LLM: I need to find a time-related tool.
     agentsbox_search_bm25({ text: "current time timezone" })

Toolbox: Returns time_get_current_time with its schema

LLM: Now I know the parameters. Let me call it.
     agentsbox_execute({ toolId: "time_get_current_time", arguments: '{"timezone":"Asia/Tokyo"}' })

Toolbox: { "datetime": "2026-01-07T02:15:00+09:00", "timezone": "Asia/Tokyo" }

LLM: "The current time in Tokyo is 2:15 AM on January 7, 2026."
```

### agentsbox_status

Get toolbox status including plugin health, MCP server connections, and tool counts:

```
agentsbox_status({})
```

Returns a comprehensive status object:

```json
{
  "plugin": {
    "initialized": true,
    "initState": "ready",
    "initMode": "eager",
    "initDurationMs": 1234,
    "configPath": "/Users/username/.config/agentsbox/config.jsonc",
    "uptime": 123.45,
    "searches": 23,
    "executions": 15,
    "successRate": "93%"
  },
  "servers": {
    "total": 3,
    "connected": 2,
    "failed": 1,
    "connecting": 0,
    "connectionRatio": "2/3",
    "details": [
      {
        "name": "time",
        "status": "connected",
        "type": "local",
        "toolCount": 2,
        "error": null,
        "commandString": "uvx mcp-server-time",
        "healthy": true
      },
      {
        "name": "github",
        "status": "connected",
        "type": "local",
        "toolCount": 12,
        "error": null,
        "commandString": "npx -y @anthropic/mcp-github",
        "healthy": true
      },
      {
        "name": "weather",
        "status": "error",
        "type": "remote",
        "toolCount": 0,
        "error": "Connection timeout after 5000ms",
        "url": "https://mcp.example.com/weather",
        "healthy": false
      }
    ]
  },
  "tools": {
    "total": 14,
    "indexed": 14,
    "serversWithTools": 2
  },
  "agentsboxTools": [
    "agentsbox_search_bm25",
    "agentsbox_search_regex",
    "agentsbox_execute",
    "agentsbox_status",
    "agentsbox_perf",
    "agentsbox_test"
  ],
  "health": {
    "status": "degraded",
    "message": "1 server(s) failed to connect"
  }
}
```

**Health Status:**
- `healthy`: All servers connected successfully
- `degraded`: Some servers failed to connect (check `servers.failed`)
- `unknown`: No servers configured or initialization failed

### /agentsbox-status Slash Command

The plugin automatically creates and maintains the `/agentsbox-status` slash command:

```
~/.config/opencode/command/agentsbox-status.md
```

Use it in OpenCode by typing `/agentsbox-status` to get a formatted status report.

> **Note:** The command file auto-updates when the plugin version changes.

### agentsbox_perf

Get detailed performance metrics for the toolbox plugin:

```
agentsbox_perf({})
```

Returns performance data including initialization times, search latencies, and execution stats:

```json
{
  "init": {
    "duration": 1234.56,
    "serverCount": 6,
    "toolCount": 42
  },
  "timers": {
    "search.bm25": { "count": 15, "total": 45.2, "avg": 3.01, "min": 1.2, "max": 8.5 },
    "search.regex": { "count": 5, "total": 12.1, "avg": 2.42, "min": 1.1, "max": 4.2 },
    "tool.execute": { "count": 10, "total": 892.3, "avg": 89.23, "min": 12.5, "max": 245.8 }
  },
  "indexStats": {
    "documentCount": 42,
    "avgDocLength": 15.3
  },
  "config": {
    "initMode": "eager",
    "connectionTimeout": 5000,
    "requestTimeout": 30000,
    "retryAttempts": 2
  }
}
```

## Search Modes

### BM25 (Natural Language)
- Best for semantic queries: "search the web", "get current time"
- Uses TF-IDF based ranking
- Searches tool name, description, and parameter info

### Regex (Pattern Matching)
- Best for precise matches: `^time_.*`, `github_`
- Supports `(?i)` prefix for case-insensitive matching
- Limited to 200 characters for safety

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed diagrams and flow explanations.

## Development

### Setup

```bash
bun install
```

### Tests

```bash
bun test              # Run all tests
bun test --coverage   # Run with coverage
```

### Build

```bash
bun run build
```

## Observability

The toolbox plugin provides built-in logging and status monitoring to help you understand what's happening.

### Logging

All plugin operations are logged **silently** to a dedicated log file (no screen output):

```
~/.local/share/agentsbox/agentsbox.log
```

Log entries include:
- Plugin initialization status
- MCP server connection status (connected/error)
- Tool search operations (BM25/regex queries + result counts)
- Tool execution results (success/failure with duration)
- Errors with details

**View logs:**
```bash
# Watch logs in real-time
tail -f ~/.local/share/agentsbox/agentsbox.log

# Check for errors only
grep "ERROR" ~/.local/share/agentsbox/agentsbox.log

# Check for warnings
grep "WARN" ~/.local/share/agentsbox/agentsbox.log
```

**Log format:**
```
2026-01-08T12:34:56.789Z [INFO] Toolbox plugin loaded successfully {"configPath":"...","serverCount":6}
2026-01-08T12:34:57.100Z [INFO] time - connection time: 648.12ms, indexed 2 tools in 0.07ms
2026-01-08T12:34:57.200Z [INFO] github - connection time: 892.45ms, indexed 12 tools in 0.15ms
2026-01-08T12:34:58.500Z [INFO] Initialization complete in 1723.45ms: 2/3 servers, 14 tools indexed
2026-01-08T12:34:58.501Z [WARN] Server weather failed: Connection timeout after 5000ms
2026-01-08T12:35:00.456Z [INFO] BM25 search completed: "web search" -> 3 results
```

### Status Tool

Use the `agentsbox_status` command to check plugin health at any time:

```
agentsbox_status({})
```

This shows:
- **Plugin Status**: Initialization, config path, uptime, search/execution counts
- **Server Status**: Connection ratio (e.g., "2/3"), details per server
- **Tools**: Total available tools, servers with tools
- **Health**: Overall health status (healthy/degraded/unknown)

**Connection Ratio**: Shows `success/total` for servers. If `success < total`, it indicates failed connections.

## Troubleshooting

### Plugin not loading

1. Run `agentsbox_status({})` to check initialization status
2. Check OpenCode logs at `~/.local/share/opencode/log/` for plugin errors
3. Verify `agentsbox` is in the `plugin` array in `opencode.jsonc`
4. Ensure `~/.config/agentsbox/config.jsonc` exists and is valid JSONC

### Search finds no tools

1. Verify underlying MCP servers are configured in `~/.config/agentsbox/config.jsonc`
2. Check tool descriptions for relevant keywords
3. Try broader search terms or regex patterns

### MCP servers not connecting

1. Run `agentsbox_status({})` to see which servers failed
2. Check logs for specific error messages from failed servers
3. Verify server command works standalone: `npx -y @anthropic/mcp-time`
4. For remote servers, verify URL is accessible
5. Check environment variables are set correctly

> **Note:** Connection retries use exponential backoff (100ms → 200ms → 400ms..., max 30s) before failing.

### Execute fails

1. Run `agentsbox_status({})` to check server health
2. Verify `toolId` format: `{serverName}_{toolName}`
3. Check `arguments` is valid JSON
4. Ensure underlying MCP server is running and connected
5. Check logs for detailed error messages

## License

MIT
