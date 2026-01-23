# Testing Guide (agentsbox)

## 1) Run tests

```bash
bun test
bun test --coverage
bun test test/unit/config.test.ts
```

## 2) Manual OpenCode integration smoke test (CLI-only)

Prereqs:
- OpenCode installed
- One or more MCP servers configured in `~/.config/agentsbox/config.jsonc`

Steps:

1. Build the package:
   ```bash
   bun install
   bun run build
   ```

2. Create local config + bundled skill:
   ```bash
   bun dist/cli.js init
   ```

3. Install the OpenCode shim plugin:
   ```bash
   bun dist/cli.js setup opencode
   ```

4. Verify the plugin file exists:
   ```bash
   ls -la "$XDG_CONFIG_HOME/opencode/plugins/agentsbox.js"
   ```

5. Start OpenCode and run:
   - `agentsbox_status({})`
   - `agentsbox_search_bm25({ text: "time", limit: 5 })`

Expected:
- `agentsbox_status` reports configured servers and tool counts.
- Search returns matching tool IDs with schemas.

## 3) Notes on coverage limits

Full coverage is not practical without:
- spawning real stdio MCP servers
- exercising real HTTP/SSE MCP connections
- running a full agent runtime end-to-end

## 4) Checklist

- [x] Unit tests for config parsing
- [x] Unit tests for BM25 search
- [x] Unit tests for regex search
- [x] Unit tests for catalog formatting
- [x] Unit tests for MCP manager via fakes
- [ ] Manual smoke test with OpenCode
- [ ] End-to-end test with real MCP servers
