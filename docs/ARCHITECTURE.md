# agentsbox Architecture

## Overview

**agentsbox** implements the "tool search tool" pattern for MCP: instead of dumping every MCP tool schema into the agent context up-front, it exposes a small set of `agentsbox_*` tools that:

1) search an internal catalog of MCP server tools on-demand
2) return the matching tool schemas
3) execute a selected tool via its `toolId`

This reduces LLM context bloat while keeping the full MCP tool surface accessible.

## Tool Registration (conceptual)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AGENT RUNTIME                                 │
│                                                                          │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐     │
│  │  Built-in Tools  │   │  MCP Server Tools │   │ agentsbox Tools  │     │
│  │                  │   │                   │   │                  │     │
│  │  • read          │   │  • time_*         │   │  • agentsbox_*    │     │
│  │  • bash          │   │  • exa_*          │   │    (search/exec)  │     │
│  │  • edit          │   │  • brave_*        │   │                  │     │
│  │  • write         │   │  • ...            │   │                  │     │
│  └────────┬─────────┘   └─────────┬─────────┘   └────────┬─────────┘     │
│           │                       │                      │               │
│           └───────────────────────┼──────────────────────┘               │
│                                   ▼                                      │
│                    ┌──────────────────────────┐                          │
│                    │     Tool Registry        │                          │
│                    │  (unified tool list)     │                          │
│                    └──────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Problem: Context Bloat

Without agentsbox, the LLM sees *all* MCP tools and schemas:

```json
{
  "tools": [
    { "name": "read", "description": "Read a file...", "parameters": {"...": "..."} },
    { "name": "bash", "description": "Execute command...", "parameters": {"...": "..."} },
    { "name": "time_get_current_time", "description": "Get time...", "parameters": {"...": "..."} },
    { "name": "exa_web_search_exa", "description": "Search web...", "parameters": {"...": "..."} }
  ]
}
```

This grows quickly with multiple servers and harms performance and prompt budget.

## Solution: agentsbox as a Gateway

With agentsbox, the LLM sees only a small, stable surface:

```json
{
  "tools": [
    { "name": "read", "description": "Read a file...", "parameters": {"...": "..."} },
    { "name": "bash", "description": "Execute command...", "parameters": {"...": "..."} },
    {
      "name": "agentsbox_search_bm25",
      "description": "Search the tool catalog by natural language",
      "parameters": { "text": { "type": "string" }, "limit": { "type": "number" } }
    },
    {
      "name": "agentsbox_search_regex",
      "description": "Search the tool catalog by regex pattern",
      "parameters": { "pattern": { "type": "string" }, "limit": { "type": "number" } }
    },
    {
      "name": "agentsbox_execute",
      "description": "Execute a discovered tool",
      "parameters": { "toolId": { "type": "string" }, "arguments": { "type": "string" } }
    }
  ]
}
```

## Request Flow Example

User: "What time is it in Tokyo?"

```
┌────────┐                    ┌────────┐                    ┌───────────┐
│  User  │                    │  LLM   │                    │ agentsbox  │
└───┬────┘                    └───┬────┘                    └────┬──────┘
    │                             │                              │
    │ Ask question                │                              │
    │────────────────────────────►│                              │
    │                             │ Search for a relevant tool   │
    │                             │ agentsbox_search_bm25({      │
    │                             │   text: "time timezone"      │
    │                             │ })                           │
    │                             │─────────────────────────────►│
    │                             │                              │ Search catalog
    │                             │◄─────────────────────────────│
    │                             │ Receives toolId + schema      │
    │                             │ agentsbox_execute({           │
    │                             │   toolId: "time_get_current_time",
    │                             │   arguments: "{\"timezone\":\"Asia/Tokyo\"}"
    │                             │ })                           │
    │                             │─────────────────────────────►│
    │                             │                              │ Call MCP server
    │                             │◄─────────────────────────────│
    │◄────────────────────────────│                              │
    │ Answer                       │                              │
```

## Key idea

agentsbox provides access to *all* MCP server tools on-demand, while keeping the agent’s always-visible tool surface small.
