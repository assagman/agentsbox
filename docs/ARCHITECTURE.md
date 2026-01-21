# Toolbox Architecture

## Overview

Toolbox (Tool Search Tool) is an OpenCode plugin that implements the "tool search tool" pattern. It reduces LLM context bloat by exposing five toolbox tools (`agentsbox_search_bm25`, `agentsbox_search_regex`, `agentsbox_execute`, `agentsbox_status`, `agentsbox_perf`) that provide on-demand access to a catalog of MCP server tools.

## Tool Registration Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           OPENCODE                                       │
│                                                                          │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐     │
│  │  Built-in Tools  │   │  MCP Server Tools │   │   Plugin Tools   │     │
│  │                  │   │                   │   │                  │     │
│  │  • read          │   │  • time_*         │   │  • supermemory   │     │
│  │  • bash          │   │  • exa_*          │   │  • agentsbox_*     │     │
│  │  • edit          │   │  • brave_*        │   │    (ours)        │     │
│  │  • write         │   │  • context7_*     │   │                  │     │
│  │  • glob          │   │                   │   │                  │     │
│  │  • grep          │   │                   │   │                  │     │
│  │  • task          │   │                   │   │                  │     │
│  └────────┬─────────┘   └─────────┬─────────┘   └────────┬─────────┘     │
│           │                       │                      │               │
│           └───────────────────────┼──────────────────────┘               │
│                                   ▼                                      │
│                    ┌──────────────────────────┐                          │
│                    │     Tool Registry        │                          │
│                    │  (unified tool list)     │                          │
│                    └──────────────────────────┘                          │
│                                   │                                      │
│                                   ▼                                      │
│                    ┌──────────────────────────┐                          │
│                    │   Send to LLM as JSON    │                          │
│                    │   Schema in API call     │                          │
│                    └──────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Problem: Context Bloat

Without Toolbox, LLM sees all MCP tools:

```json
{
  "tools": [
    { "name": "read", "description": "Read a file...", "parameters": {...} },
    { "name": "bash", "description": "Execute command...", "parameters": {...} },
    { "name": "time_get_current_time", "description": "Get time...", "parameters": {...} },
    { "name": "time_convert_time", "description": "Convert time...", "parameters": {...} },
    { "name": "exa_web_search_exa", "description": "Search web...", "parameters": {...} },
    ... (50+ more tools)
  ]
}
```

## Solution: Toolbox as Gateway

With Toolbox plugin, LLM sees only essential tools:

```json
{
  "tools": [
    { "name": "read", "description": "Read a file...", "parameters": {...} },
    { "name": "bash", "description": "Execute command...", "parameters": {...} },
    { "name": "agentsbox_search_bm25", "description": "Search toolbox by natural language", "parameters": {
        "text": { "type": "string" },
        "limit": { "type": "number" }
      }
    },
    { "name": "agentsbox_search_regex", "description": "Search toolbox by regex pattern", "parameters": {
        "pattern": { "type": "string" },
        "limit": { "type": "number" }
      }
    },
    { "name": "agentsbox_execute", "description": "Execute a discovered tool", "parameters": {
        "toolId": { "type": "string" },
        "arguments": { "type": "string" }
      }
    }
  ]
}
```

## Toolbox Plugin Initialization

```
┌─────────────────────────────────────────────────────────────────┐
│                      OPENCODE STARTUP                            │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ Load Built-in │     │  Load Plugins │     │  Load MCP     │
│    Tools      │     │               │     │  Servers      │
└───────────────┘     └───────┬───────┘     └───────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ agentsbox  │
                    │ plugin loads      │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────────────────────────┐
                    │ Toolbox Plugin Initialization:        │
                    │                                       │
                    │ 1. Read ~/.config/agentsbox/config.jsonc │
                    │ 2. Connect to configured MCP servers  │
                    │ 3. Fetch all tools from each server   │
                    │ 4. Build internal catalog             │
                    │ 5. Return 5 toolbox tools             │
                    └───────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────────────────────────┐
                    │         TOOL REGISTRY                 │
                    │                                       │
                    │  • read                               │
                    │  • bash                               │
                    │  • edit                               │
                    │  • write                              │
                    │  • glob                               │
                    │  • grep                               │
                    │  • task                               │
                    │  • agentsbox_search_bm25  ◄── PLUGIN    │
                    │  • agentsbox_search_regex ◄── PLUGIN    │
                    │  • agentsbox_execute      ◄── PLUGIN    │
                    │  • agentsbox_status       ◄── PLUGIN    │
                    │  • agentsbox_perf         ◄── PLUGIN    │
                    │                                       │
                    │  (NO time_*, exa_*, brave_* etc.)     │
                    └───────────────────────────────────────┘
```

## Request Flow: "What time is it in Tokyo?"

```
┌────────┐                    ┌────────┐                    ┌─────────┐
│  User  │                    │  LLM   │                    │ Toolbox │
└───┬────┘                    └───┬────┘                    └────┬────┘
    │                             │                              │
    │ "What time is it in Tokyo?" │                              │
    │────────────────────────────►│                              │
    │                             │                              │
    │                             │ Hmm, I need time info.       │
    │                             │ I have agentsbox_search tools. │
    │                             │ Let me search for time tools │
    │                             │                              │
    │                             │ agentsbox_search_bm25({        │
    │                             │   text: "time timezone"      │
    │                             │ })                           │
    │                             │─────────────────────────────►│
    │                             │                              │
    │                             │                              │ Search catalog
    │                             │                              │ using BM25
    │                             │                              │
    │                             │◄─────────────────────────────│
    │                             │ {                            │
    │                             │   "tools": [{                │
    │                             │     "name": "time_get_current_time",
    │                             │     "description": "Get current time in timezone",
    │                             │     "schema": {              │
    │                             │       "timezone": {          │
    │                             │         "type": "string",    │
    │                             │         "description": "IANA timezone name"
    │                             │       }                      │
    │                             │     }                        │
    │                             │   }]                         │
    │                             │ }                            │
    │                             │                              │
    │                             │ Now I know the schema!       │
    │                             │ timezone is a string,        │
    │                             │ Tokyo = "Asia/Tokyo"         │
    │                             │                              │
    │                             │ agentsbox_execute({            │
    │                             │   toolId: "time_get_current_time",
    │                             │   arguments: '{"timezone":"Asia/Tokyo"}'
    │                             │ })                           │
    │                             │─────────────────────────────►│
    │                             │                              │
    │                             │                              │ Parse toolId
    │                             │                              │ → server: "time"
    │                             │                              │ → tool: "get_current_time"
    │                             │                              │
    │                             │                              │ Call MCP server
    │                             │                              │     │
    │                             │                              │     ▼
    │                             │                              │ ┌────────────┐
    │                             │                              │ │ Time MCP   │
    │                             │                              │ │ Server     │
    │                             │                              │ └────────────┘
    │                             │                              │
    │                             │◄─────────────────────────────│
    │                             │ {                            │
    │                             │   "time": "2026-01-07T02:15:00+09:00",
    │                             │   "timezone": "Asia/Tokyo"   │
    │                             │ }                            │
    │                             │                              │
    │◄────────────────────────────│                              │
    │ "The current time in Tokyo  │                              │
    │  is 2:15 AM on Jan 7, 2026" │                              │
    │                             │                              │
```

## Tool Call Details

### Step 1: Search

```typescript
// LLM generates:
{ "name": "agentsbox_search_bm25", "arguments": { "text": "time timezone" } }

// Toolbox returns:
{
  "tools": [
    {
      "name": "time_get_current_time",
      "description": "Get current time in a specific timezone",
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
  ]
}
```

### Step 2: Execute

```typescript
// LLM generates (using schema from search):
{
  "name": "agentsbox_execute",
  "arguments": {
    "toolId": "time_get_current_time",
    "arguments": "{\"timezone\":\"Asia/Tokyo\"}"
  }
}

// Toolbox parses toolId: "time_get_current_time" → server="time", tool="get_current_time"
// Toolbox calls MCP server and returns result
```

## Tool Visibility Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPENCODE TOOL LIST                            │
├─────────────────────────────────────────────────────────────────┤
│  BUILT-IN          PLUGIN                   (MCP - hidden)      │
│  ─────────         ──────                   ─────────────────   │
│  • read            • agentsbox_search_bm25 ◄─► time_get_current_time │
│  • bash            • agentsbox_search_regex   time_convert_time   │
│  • edit            • agentsbox_execute        exa_web_search_exa  │
│  • write           • supermemory            exa_crawling_exa    │
│  • glob                                     brave_web_search    │
│  • grep                                     brave_news_search   │
│  • task                                     context7_resolve... │
│  • lsp                                      ... (50+ more)      │
│  • todowrite                                                    │
│  • todoread                                                     │
└─────────────────────────────────────────────────────────────────┘

LLM only sees left two columns (~14 tools)
Toolbox provides access to right column on-demand
```

## Search Engines

Toolbox supports two search modes:

### BM25 (Natural Language)
- Best for semantic queries like "search the web", "get current time"
- Uses TF-IDF based ranking with k1=1.2, b=0.75
- Searches tool name, description, and parameter info

### Regex (Pattern Matching)
- Best for precise matches like "exa_.*", "brave_"
- Supports Python-style `(?i)` for case-insensitive
- Limited to 200 characters for safety
