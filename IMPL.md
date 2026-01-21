---
title: agentsbox implementation notes
status: draft
updated: 2026-01-21
---

# Goals

Build **agentsbox** (Bun + TypeScript) as a **single npm package** that exposes a small, stable tool surface for searching and executing MCP server tools on-demand.

Integrations:
- **OpenCode**: plugin entrypoint via `agentsbox/opencode` (installed by `agentsbox setup opencode`).
- **pi**: extension entrypoint via `agentsbox/pi` (installed by `agentsbox setup pi`).
- **Skill**: bundled `skill/agentsbox/**` (installed by `agentsbox init`).

Constraints:
- CLI-only setup (no GUI assumptions).
- No implicit agent integration just by installing the package; user must explicitly run `agentsbox setup <target>`.
- Config lives under XDG config (default: `~/.config/agentsbox/config.jsonc`).

# Tool surface

- `agentsbox_search_bm25`
- `agentsbox_search_regex`
- `agentsbox_execute`
- `agentsbox_status`
- `agentsbox_perf`
- `agentsbox_test`

# Architecture (high-level)

```
+-----------------------------+
| agentsbox (npm pkg)         |
|  - core runtime             |
|  - MCP manager + catalog    |
|  - adapters: opencode, pi   |
|  - CLI: init/setup/doctor   |
|  - bundled Skill template   |
+--------------+--------------+
               |
               v
   +---------------------+                    +-----------------------+
   | ~/.config/agentsbox |                    | Agent runtimes        |
   |  config.jsonc       |                    |  - OpenCode           |
   |  schema/skill       |------symlink/cp--->|  - pi                 |
   +---------------------+                    +-----------------------+
```

# Setup flows

## `agentsbox init`
Creates (under XDG config dir):
- `agentsbox/config.jsonc`
- `agentsbox/agentsbox.schema.json`
- `agentsbox/skill/agentsbox/**`

## `agentsbox setup opencode`
Installs a shim plugin file into OpenCode’s plugin directory (auto-loaded by OpenCode).

## `agentsbox setup pi`
Registers a local pi extension by symlinking a wrapper directory into pi’s extensions folder.
