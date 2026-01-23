# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-01-23

Initial public release.

### Added

- Core **agentsbox** runtime implementing the “tool search tool” pattern for MCP (minimizes agent context bloat while keeping full tool access).
- Stable tool surface exposed to agents:
  - `agentsbox_search_bm25` (natural language search)
  - `agentsbox_search_regex` (regex search)
  - `agentsbox_execute` (execute a discovered tool by `toolId`)
  - `agentsbox_status` (connection/catalog status)
  - `agentsbox_perf` (runtime performance summary)
  - `agentsbox_test` (minimal tool smoke tests)
- Tool catalog:
  - Discovers tools from configured MCP servers and normalizes them into a unified catalog.
  - Uses a stable `toolId` format: `{serverName}_{toolName}`.
- MCP connectivity:
  - Local MCP servers via stdio child processes.
  - Remote MCP servers via HTTP endpoints.
  - Configurable connect/request timeouts + retry policy.
  - `initMode`: `eager` (connect at startup) or `lazy` (connect on demand).
- CLI-only setup flows:
  - `agentsbox init`: scaffold XDG config (`config.jsonc`), local schema (`agentsbox.schema.json`), and bundled `skill/agentsbox/**`.
  - `agentsbox setup opencode`: install a local OpenCode shim plugin.
  - `agentsbox setup pi`: install a local pi extension wrapper.
- Integrations:
  - OpenCode plugin entrypoint (`agentsbox/opencode`).
  - pi extension entrypoint (`agentsbox/pi`).
- Search implementations:
  - BM25 ranking for natural-language queries.
  - Regex search for quick name-based discovery.
- Observability:
  - Lightweight profiler and metrics surfaced via `agentsbox_perf`/`agentsbox_status`.
- Quality + automation:
  - Extensive test suite (unit + integration + e2e) using fakes where real MCP servers are impractical.
  - Benchmarks for search, init, and concurrency.
  - Biome formatting/linting, Husky + lint-staged hooks, and CI enforcing check + typecheck + test.
  - Release workflows for release PRs and publishing.
- Documentation:
  - README quick start.
  - `CONFIG.md`, `docs/ARCHITECTURE.md`, `IMPL.md`, `TESTING.md`, `RELEASE.md`.
  - `example-config.jsonc` and `agentsbox.schema.json`.

### Security

- Hardened release workflows to reduce script injection risk.
- Pinned MCP server/tooling versions (supply-chain hardening).

## [0.0.1] - 2026-01-21

- Pre-release internal scaffolding (unpublished).
