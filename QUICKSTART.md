# agentsbox Quick Start Guide

This guide walks you through setting up and using agentsbox with both OpenCode and pi.

---

## Installation

### From Source

```bash
# Clone and install
git clone https://github.com/assagman/agentsbox.git
cd agentsbox
bun install
bun run build
```

The CLI is now available at `bun dist/cli.js` (or link to `$PATH` with `bun link`).

---

## Step 1: Initialize

Run the init command to create the config directory:

```bash
bun dist/cli.js init
```

**What this creates:**

```
~/.config/agentsbox/
├── config.jsonc              # Your configuration file
├── agentsbox.schema.json     # JSON Schema for validation
└── skill/agentsbox/          # Bundled skill
    ├── SKILL.md
    └── references/
        └── REFERENCE.md
```

**Dry-run first** (optional):

```bash
bun dist/cli.js init --dry-run
```

---

## Step 2: Configure MCP Servers

Edit `~/.config/agentsbox/config.jsonc` to add MCP servers.

### Example: Local MCP Server

```jsonc
{
  "$schema": "./agentsbox.schema.json",
  "mcp": {
    "time": {
      "type": "local",
      "command": ["uvx", "mcp-server-time"]
    }
  },
  "settings": {
    "defaultLimit": 5,
    "initMode": "eager"
  }
}
```

### Example: Remote MCP Server

```jsonc
{
  "$schema": "./agentsbox.schema.json",
  "mcp": {
    "tavily": {
      "type": "remote",
      "url": "https://mcp.tavily.com/mcp/",
      "headers": {
        "Authorization": "Bearer {env:TAVILY_API_KEY}"
      }
    }
  },
  "settings": {
    "defaultLimit": 5,
    "initMode": "eager"
  }
}
```

### Multiple Servers

```jsonc
{
  "$schema": "./agentsbox.schema.json",
  "mcp": {
    "time": {
      "type": "local",
      "command": ["uvx", "mcp-server-time"]
    },
    "tavily": {
      "type": "remote",
      "url": "https://mcp.tavily.com/mcp/",
      "headers": {
        "Authorization": "Bearer {env:TAVILY_API_KEY}"
      }
    },
    "brave": {
      "type": "remote",
      "url": "{env:BRAVE_MCP_URL}",
      "headers": {
        "Authorization": "Bearer {env:BRAVE_API_KEY}"
      }
    }
  }
}
```

---

## Step 3: Setup Integration

### Option A: OpenCode

```bash
bun dist/cli.js setup opencode
```

**What this does:**

- Copies `dist/opencode.js` to `~/.config/opencode/plugins/agentsbox.js`
- OpenCode auto-loads all plugins from that directory

**Verify:**

```bash
ls -la ~/.config/opencode/plugins/agentsbox.js
```

### Option B: pi

```bash
bun dist/cli.js setup pi
```

**What this does:**

- Creates wrapper extension at `~/.config/agentsbox/integrations/pi/extension/`
- Symlinks the current agentsbox package into wrapper's `node_modules`
- Symlinks the wrapper into `~/.pi/agent/extensions/agentsbox`

**Verify:**

```bash
ls -la ~/.pi/agent/extensions/agentsbox
```

---

## Step 4: Using agentsbox

### With OpenCode

After starting OpenCode, the following tools are available:

#### Search for tools

```javascript
// Natural language search
agentsbox_search_bm25({
  text: "get current time"
})

// Pattern search (know part of tool name)
agentsbox_search_regex({
  pattern: "time_.*"
})
```

#### Execute a tool

```javascript
// After finding toolId from search
agentsbox_execute({
  toolId: "time_get_current_time",
  arguments: JSON.stringify({ timezone: "America/New_York" })
})

// Tools with no required args
agentsbox_execute({
  toolId: "time_get_current_time"
})
```

#### Check status

```javascript
agentsbox_status({})
```

Returns:
```json
{
  "plugin": {
    "initialized": true,
    "initMode": "eager",
    "searches": 5,
    "executions": 3,
    "successRate": "100%"
  },
  "servers": {
    "total": 2,
    "connected": 2,
    "failed": 0,
    "details": [
      {
        "name": "time",
        "status": "connected",
        "type": "local",
        "toolCount": 3,
        "healthy": true
      },
      {
        "name": "tavily",
        "status": "connected",
        "type": "remote",
        "toolCount": 4,
        "healthy": true
      }
    ]
  },
  "tools": {
    "total": 7,
    "indexed": 7
  },
  "health": {
    "status": "healthy",
    "message": "All servers connected"
  }
}
```

### With pi

After running `agentsbox setup pi`, pi automatically discovers the extension.

The same tools are available, with additional commands:

- `/agentsbox-status` – Show status without LLM
- `/agentsbox-search <query>` – Quick BM25 search without LLM
- `/agentsbox-help` – Show help

---

## Common Workflows

### Workflow 1: Discover All Tools

```javascript
// List all tools
agentsbox_search_regex({
  pattern: ".*",
  limit: 100
})
```

### Workflow 2: Discover Tools by Server

```javascript
// All tools from 'tavily' server
agentsbox_search_regex({
  pattern: "tavily_.*"
})

// All time-related tools
agentsbox_search_regex({
  pattern: "time_.*"
})
```

### Workflow 3: Search by Intent

```javascript
// Don't know tool name, just what you want
agentsbox_search_bm25({
  text: "search the web for news",
  limit: 5
})

agentsbox_search_bm25({
  text: "scrape a webpage",
  limit: 5
})
```

### Workflow 4: Troubleshoot

```javascript
// Check if servers are connected
agentsbox_status({})

// Get performance metrics
agentsbox_perf({})

// Test all tools with minimal inputs
agentsbox_test({ timeout: 10000 })
```

---

## Tool Reference

### agentsbox_search_bm25

Search tools by natural language description.

**Parameters:**
```typescript
{
  text: string,        // Query description
  limit?: number       // Max results (default: 5)
}
```

**Returns:**
```json
{
  "count": 3,
  "tools": [
    {
      "name": "time_get_current_time",
      "description": "Get the current time...",
      "score": 0.89,
      "schema": { /* JSON Schema */ }
    }
  ],
  "usage": "Use agentsbox_execute({ toolId: '<toolId>', arguments: '<json>' })"
}
```

### agentsbox_search_regex

Search tools by regex pattern on tool names.

**Parameters:**
```typescript
{
  pattern: string,      // Regex (max 200 chars)
  limit?: number       // Max results (default: 5)
}
```

**Returns:** Same as `agentsbox_search_bm25`

### agentsbox_execute

Execute a discovered tool.

**Parameters:**
```typescript
{
  toolId: string,       // Format: {serverName}_{toolName}
  arguments?: string    // JSON-encoded arguments
}
```

**Returns:**
```json
{
  "success": true,
  "result": /* tool output */
}
```

### agentsbox_status

Get plugin and server status.

### agentsbox_perf

Get performance metrics (init time, search latency, etc.).

### agentsbox_test

Test all tools with minimal predefined inputs.

---

## Configuration Options

### Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultLimit` | number | 5 | Default result limit for searches |
| `initMode` | `"eager" \| "lazy"` | `"eager"` | When to connect to MCP servers |
| `connection.connectTimeout` | number | 5000 | Connection timeout (ms) |
| `connection.requestTimeout` | number | 30000 | Request timeout (ms) |
| `connection.retryAttempts` | number | 2 | Retry attempts on failure |
| `connection.retryDelay` | number | 1000 | Delay between retries (ms) |

### Init Modes

- **eager** (default): Connect to all servers in background immediately after plugin load
- **lazy**: Connect only when first search/execute is requested

---

## Troubleshooting

### Tools Not Found

**Problem:** Search returns empty results

**Check:**
```javascript
agentsbox_status({})
```

**Common causes:**
- MCP server not connected (check `servers.details` in status)
- Tool name pattern incorrect (try `.*` to list all)
- Server name contains `_` (not allowed)

### Tool Execution Failed

**Problem:** `agentsbox_execute` returns error

**Check response:**
```json
{
  "success": false,
  "error": "...",
  "server": {
    "name": "...",
    "status": "error",
    "error": "..."
  }
}
```

**Common causes:**
- Invalid arguments (check schema from search result)
- Server disconnected
- Missing environment variables for `{env:VAR_NAME}`

### Performance Issues

**Check metrics:**
```javascript
agentsbox_perf({})
```

Look for:
- High `searchLatency` (ms)
- High `executionLatency` (ms)
- Failed server connections

---

## Next Steps

- [Configuration reference](./CONFIG.md)
- [Architecture deep-dive](./docs/ARCHITECTURE.md)
- [Development guide](./DEVELOPMENT.md)
- [For coding agents](./AGENTS.md)
