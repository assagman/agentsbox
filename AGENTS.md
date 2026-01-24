# AGENTS.md

Coding agent guidelines for using agentsbox effectively.

---

## Agent Behavior Guidelines

### Always Search Before Saying "I Cannot Do That"

**WRONG:**
```
User: "Search the web for AI news"
Agent: "I cannot do that. I don't have a web search tool."
```

**CORRECT:**
```
User: "Search the web for AI news"
Agent: agentsbox_search_bm25({ text: "web search", limit: 5 })
      → Finds: brave_web_search, tavily_search
      Agent: agentsbox_execute({ toolId: "brave_web_search", arguments: '{"query":"AI news","count":5}' })
```

---

## Tool Usage Patterns

### Pattern 1: Intent-Based Search (BM25)

Use when you know what you want to do but not the tool name.

```javascript
// Good: descriptive intent
agentsbox_search_bm25({
  text: "search the web",
  limit: 5
})

// Good: specific action
agentsbox_search_bm25({
  text: "get current time with timezone",
  limit: 5
})

// Bad: tool name guessing
agentsbox_search_bm25({
  text: "brave_search_web",
  limit: 5
})
```

### Pattern 2: Pattern-Based Search (Regex)

Use when you know a server name or partial tool name.

```javascript
// All tools from a server
agentsbox_search_regex({
  pattern: "tavily_.*",
  limit: 20
})

// Specific prefix
agentsbox_search_regex({
  pattern: "time_.*",
  limit: 10
})

// List all tools (discovery)
agentsbox_search_regex({
  pattern: ".*",
  limit: 100
})
```

### Pattern 3: Fallback Chain

```javascript
// 1) Try regex first (faster if you know the prefix)
let result = agentsbox_search_regex({ pattern: "web_.*search.*", limit: 5 })

if (result.tools.length === 0) {
  // 2) Fall back to BM25 (semantic)
  result = agentsbox_search_bm25({ text: "search the web", limit: 5 })
}

if (result.tools.length === 0) {
  // 3) Check status
  const status = agentsbox_status({})
  // Log server connection issues, ask user to configure
}
```

---

## ToolId Format

```
toolId = {serverName}_{toolName}

Examples:
- time_get_current_time
- brave_web_search
- tavily_tavily-search
- context7_resolve-library-id
```

**IMPORTANT:** Server names MUST NOT contain underscores.

---

## Execution Best Practices

### 1) Always Validate Arguments

```javascript
// Search first to get schema
const searchResult = agentsbox_search_bm25({
  text: "web search",
  limit: 1
})

const tool = searchResult.tools[0]
const schema = tool.schema

// Build arguments based on schema
const args = buildArgsFromSchema(schema, userRequest)

// Execute
agentsbox_execute({
  toolId: tool.name,
  arguments: JSON.stringify(args)
})
```

### 2) Handle Errors Gracefully

```javascript
const result = JSON.parse(agentsbox_execute({
  toolId: "time_get_current_time",
  arguments: '{}'
}))

if (!result.success) {
  // Check server info in error response
  if (result.server) {
    console.log(`Server ${result.server.name} status: ${result.server.status}`)
    if (result.server.error) {
      console.log(`Server error: ${result.server.error}`)
    }
  }

  // Provide helpful error to user
  return `Failed to get time: ${result.error}`
}

return `Current time: ${result.result}`
```

### 3) Use Minimal Arguments for Required Fields Only

```javascript
// Get schema from search result
const schema = tool.schema

// Only fill required properties
const args = {}
for (const propName of schema.required || []) {
  const prop = schema.properties[propName]
  args[propName] = getMinimalValueForType(prop.type)
}

agentsbox_execute({
  toolId: tool.name,
  arguments: JSON.stringify(args)
})
```

---

## System Prompt Integration

The agentsbox runtime provides a structured system prompt in XML format:

```xml
<MCPTools>
  <Rules>
    ALWAYS agentsbox_search_* before saying "I cannot do that"
    ALWAYS agentsbox_search_* if user wants to use tools
  </Rules>
  <MCPServers>
    <Registry>
      time_*
      tavily_*
      brave_*
    </Registry>
    <NamingConvention>
      toolId: {serverName}_{toolName}
    </NamingConvention>
    <Discovery>
      <ListAllTools>agentsbox_search_regex({ pattern: ".*" })</ListAllTools>
      <ServerTools>agentsbox_search_regex({ pattern: "serverName_.*" })</ServerTools>
      <FreeSearch>agentsbox_search_bm25({ text: "keywords" })</FreeSearch>
    </Discovery>
  </MCPServers>
</MCPTools>
```

**Agent should:**
1. Parse the registry to know available servers
2. Follow the discovery patterns
3. Respect the naming convention
4. Use the fallback chain when tools aren't found

---

## Common Workflows

### Workflow 1: Web Search

```javascript
// Step 1: Find search tool
const searchResult = agentsbox_search_bm25({
  text: "search the web",
  limit: 5
})

// Step 2: Pick best tool
const tool = searchResult.tools[0]  // e.g., "brave_web_search"

const userQuery = "AI news";

// Step 3: Build arguments
const args = {
  query: userQuery,
  count: 5
}

// Step 4: Execute
const result = JSON.parse(agentsbox_execute({
  toolId: tool.name,
  arguments: JSON.stringify(args)
}))

// Step 5: Present results
formatResultsForUser(result.result)
```

### Workflow 2: Time/Timezone

```javascript
// Search for time tools
const result = agentsbox_search_regex({
  pattern: "time_.*",
  limit: 10
})

// Find specific tool
const getTool = result.tools.find(t => t.name === "time_get_current_time")

// Execute with timezone
const timeResult = JSON.parse(agentsbox_execute({
  toolId: getTool.name,
  arguments: JSON.stringify({ timezone: "America/New_York" })
}))
```

### Workflow 3: Web Scraping

```javascript
// Find scraping tools
const result = agentsbox_search_bm25({
  text: "scrape webpage as markdown",
  limit: 5
})

if (result.tools.length === 0) {
  return "No scraping tools found";
}

// Execute
const scrapeResult = JSON.parse(agentsbox_execute({
  toolId: result.tools[0].name,
  arguments: JSON.stringify({ url: userUrl })
}))

// Process content
processMarkdown(scrapeResult.result)
```

### Workflow 4: GitHub Integration

```javascript
// Search for GitHub tools
const result = agentsbox_search_regex({
  pattern: "github.*",
  limit: 10
})

const structureTool = result.tools.find(t => t.name.includes("githubViewRepoStructure"))
const searchTool = result.tools.find(t => t.name.includes("githubSearchCode"))

// Find repo
const repoResult = JSON.parse(agentsbox_execute({
  toolId: structureTool.name,
  arguments: JSON.stringify({
    owner: "owner",
    repo: "repo"
  })
}))

// Search code
const searchResult = JSON.parse(agentsbox_execute({
  toolId: searchTool.name,
  arguments: JSON.stringify({
    query: "function search",
    maxResults: 10
  })
}))
```

---

## Troubleshooting Guide

### Issue: Search Returns Empty Results

**Diagnosis:**
```javascript
const status = agentsbox_status({})

// Check:
// - status.servers.connected > 0
// - status.tools.total > 0
// - status.health.status === "healthy"
```

**Actions:**
- If servers not connected: Check MCP server configuration
- If tools.total === 0: MCP servers not exposing tools
- If degraded state: Check server details for errors

### Issue: Tool Execution Fails

**Diagnosis:**
```javascript
const result = JSON.parse(agentsbox_execute(...))

if (!result.success) {
  // Examine result.server
  console.log("Server status:", result.server.status)
  console.log("Server error:", result.server.error)

  // Check if server is connected
  if (result.server.status === "unknown") {
    // Server not configured or failed to establish initial connection
  }
}
```

**Actions:**
- Re-check toolId format (must have `_` separator)
- Verify arguments match schema from search result
- Check server health via `agentsbox_status()`

### Issue: Performance Slow

**Diagnosis:**
```javascript
const perf = agentsbox_perf({})

// Check:
// - report.initDuration (ms)
// - report.searchLatency.average (ms)
// - report.executionLatency.average (ms)
```

**Optimization:**
- Use `agentsbox_search_regex()` when you know server prefix
- Reduce `limit` parameter in searches
- Set appropriate connection timeouts in config

---

## Testing Tools

Use `agentsbox_test()` to verify all tools work:

```javascript
const testResult = agentsbox_test({ timeout: 10000 })

// Returns pass/fail for each tool
// Helps identify broken tools before execution
```

---

## Reference Tool Descriptions

### agentsbox_search_bm25
Search tools by natural language description. Use when you know what you want to do but not the tool name.

### agentsbox_search_regex
Search tools by regex pattern on tool names. Use when you know a server name or partial tool name. Max pattern length: 200 chars.

### agentsbox_execute
Execute a discovered tool. `toolId` format: `{serverName}_{toolName}`. Arguments must be JSON-encoded string matching tool's schema.

### agentsbox_status
Get status including plugin initialization, MCP server connections, and tool counts. Shows success/total metrics to highlight failures.

### agentsbox_perf
Get detailed performance metrics: initialization times, search latencies, execution stats, per-server metrics.

### agentsbox_test
Test all tools with minimal predefined inputs. Executes every registered tool to verify they work. Returns pass/fail for each tool.

---

## Memory and Context Management

### Efficient Search Patterns

```javascript
// BAD: Search for every operation
for (const task of tasks) {
  const result = agentsbox_search_bm25({ text: task.description })
  // ...
}

// GOOD: Discover tools once, then reuse
const tools = agentsbox_search_regex({ pattern: ".*", limit: 100 })
const toolMap = new Map(tools.tools.map(t => [t.name, t]))

for (const task of tasks) {
  const tool = findToolForTask(task, toolMap)
  // ...
}
```

### Batch When Possible

```javascript
// Some tools support batch operations
const batchResult = agentsbox_execute({
  toolId: "brightdata_scrape_batch",
  arguments: JSON.stringify({
    urls: ["url1", "url2", "url3"]  // Single call for multiple URLs
  })
})
```

---

## Security Considerations

1. **Never expose API keys** in tool arguments
2. **Sanitize user input** before passing to tools
3. **Validate tool responses** before processing
4. **Use timeout parameters** for potentially slow operations
5. **Check server URLs** before executing (phishing risk)

---

## Summary Checklist

- [ ] Always search before saying "I cannot do that"
- [ ] Use regex for known patterns, BM25 for semantic search
- [ ] Validate toolId format: `{serverName}_{toolName}`
- [ ] Get schema from search result before building arguments
- [ ] Handle errors and provide helpful feedback to user
- [ ] Use `agentsbox_status()` for diagnostics
- [ ] Use `agentsbox_test()` to verify tools work
- [ ] Check `agentsbox_perf()` for performance issues
- [ ] Reuse search results instead of repeated searches
- [ ] Respect timeout parameters for slow operations
