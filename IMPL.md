---
title: agentsbox implementation plan
status: draft
updated: 2026-01-21
---

# Progress

- [x] Bootstrapped `ai/agentsbox/` by copying `~/source/me/opencode-toolbox/main/` (excluding node_modules/dist/coverage)
- [x] Renamed package to `agentsbox` (package.json, docs, schema URL)
- [x] Renamed tool surface from `toolbox_*` to `agentsbox_*`
- [x] Renamed schema artifact: `toolbox.schema.json` → `agentsbox.schema.json`
- [x] Added explicit OpenCode entrypoint: `agentsbox/opencode` (`src/opencode.ts`)
- [x] Package root no longer default-exports the OpenCode plugin (`src/index.ts` is core-only)
- [x] Added bundled Agent Skill: `skill/agentsbox/**`
- [x] Added CLI entrypoint: `src/cli.ts` (`agentsbox init`, `agentsbox setup opencode`, `--dry-run`, summary table)
- [x] Implement `agentsbox setup opencode` (installs OpenCode plugin file into `~/.config/opencode/plugins/agentsbox.js`)
- [x] CLI always prints a plan first; non-`--dry-run` asks confirmation before applying
- [ ] Implement `agentsbox setup pi|skill` (extension/skill wiring)
- [ ] Implement pi extension entrypoint (`agentsbox/pi`)
- [ ] Implement `doctor` diagnostics

# Goal
Build **agentsbox** (Bun + TypeScript) as a **single npm package** that reuses the full core architecture of `opencode-toolbox`, but exposes it via:

1) **OpenCode integration** (plugin via a local “shim plugin” installed by CLI)
2) **pi-mono integration** (extension installed by CLI)
3) **Agent Skill** (AgentSkills spec folder with `SKILL.md`, installed by CLI)

Constraints:
- **No MCP server exposure for now**.
- **Config schema stays identical** to `opencode-toolbox` (same JSON Schema structure/fields), but **renamed artifact/URLs** to match `agentsbox`.
- **No implicit “default plugin behavior”**: installing the npm package alone should not automatically behave as an OpenCode plugin.
  - Users must explicitly run `agentsbox setup opencode` or `agentsbox setup pi`.
- Setup must be **frictionless** and **CLI-only**:
  - `agentsbox init` creates canonical config + assets under `~/.config/agentsbox/`.
  - `agentsbox setup <target>` wires agent-specific integration by **placing shim files** into agent-specific folders (no config patching).
  - `--dry-run` prints all planned filesystem changes.
  - Non-dry-run prints a plan first, then asks for confirmation, then prints a summary table.

Canonical config:
- path: `~/.config/agentsbox/config.jsonc`
- env override: `AGENTSBOX_CONFIG`

Tool surface (renamed from `toolbox_*`):
- `agentsbox_search_bm25`
- `agentsbox_search_regex`
- `agentsbox_execute`
- `agentsbox_status`
- `agentsbox_perf`
- `agentsbox_test`

---

# Architecture overview

## Components

```
+-----------------------------+
| agentsbox (npm pkg)         |
|  - core engine              |
|  - adapters: opencode, pi   |
|  - CLI: init/setup/doctor   |
|  - bundled Skill template   |
+--------------+--------------+
               |
               v
   +---------------------+                    +-----------------------+
   | ~/.config/agentsbox |                    | Agent runtimes        |
   |  config.jsonc       |                    |  - OpenCode           |
   |  integrations/*     |------symlink------>|  - pi-mono            |
   |  skill/*            |                    |                       |
   +---------------------+                    +-----------------------+
```

## Why “shim packages” are required

- You requested: **agentsbox must not default-export an OpenCode plugin at package root**.
- OpenCode can auto-load local plugins from:
  - `~/.config/opencode/plugins/*.{js,ts}`

Solution:
- `agentsbox setup opencode` installs a single plugin file:
  - `~/.config/opencode/plugins/agentsbox.js`
  - (copied from `agentsbox/dist/opencode.js` bundle)
- No `opencode.jsonc` modification and no `file://...` plugin entries.

(Planned later) pi integration:
- install an extension directory under `~/.pi/agent/extensions/agentsbox`.

---

# Repo bootstrap (in this dotfiles repo)

## Source
- Local reference: `~/source/me/agentsbox/main/`

## Target
- Create: `ai/agentsbox/` (this repo)

## Steps
1. Copy `~/source/me/agentsbox/main/*` → `ai/agentsbox/`.
2. Rename package to `agentsbox` (package.json fields, README, schema URL references).
3. Add new docs file: `ai/agentsbox/IMPL.md` (this file).

Verification commands:
- `cd ai/agentsbox && bun test`
- `cd ai/agentsbox && bun run typecheck`
- `cd ai/agentsbox && bun run build`

---

# Target directory layout (inside the npm package)

Single package (Option A), but with strict boundaries:

```
ai/agentsbox/
  src/
    core/                      # extracted engine (agent-agnostic)
      catalog/
      config/
      mcp-client/
      profiler/
      search/
      engine.ts                # new: adapter-agnostic API
      prompt.ts                # new: shared prompt/skill text generators
    adapters/
      opencode/
        plugin.ts              # OpenCode plugin implementation (NOT default export at pkg root)
        command.ts             # content generator for /agentsbox-status etc.
      pi/
        extension.ts           # pi extension implementation
        commands.ts            # pi commands wrappers
    cli/
      main.ts                  # bun bin entry
      actions/
        init.ts
        setup-opencode.ts
        setup-pi.ts
        setup-skill.ts
        doctor.ts
      fs/
        plan.ts                # produces (and prints) change plan
        apply.ts               # executes plan atomically
        jsonc.ts               # jsonc-parser patch helpers
  skill/                        # bundled Agent Skill template
    agentsbox/
      SKILL.md
      references/
        REFERENCE.md
  agentsbox.schema.json          # identical schema *structure*; renamed artifact
```

Exports (package.json `exports`):
- `"."` → core public API only (types + helpers), **not a plugin default**
- `"./opencode"` → `dist/adapters/opencode/plugin.js`
- `"./pi"` → `dist/adapters/pi/extension.js`

Bin:
- `agentsbox` → `dist/cli/main.js`

---

# Core refactor plan (preserve functionality)

## Objective
Extract all reusable logic from `agentsbox` into a **core engine** that:
- loads config
- manages MCP connections (client-side) and tool catalog
- builds BM25 index
- exposes search/execute/status/perf/test methods

## Steps
1. Move existing modules under `src/core/**` with minimal change:
   - `src/catalog/*` → `src/core/catalog/*`
   - `src/config/*` → `src/core/config/*`
   - `src/mcp-client/*` → `src/core/mcp-client/*`
   - `src/search/*` → `src/core/search/*`
   - `src/profiler/*` → `src/core/profiler/*`

2. Implement `src/core/engine.ts`:
   - `createEngine({ configPath, initModeOverride?, logger?, now? })`
   - Methods:
     - `ensureInitialized()`
     - `searchBM25({ text, limit })`
     - `searchRegex({ pattern, limit })`
     - `execute({ toolId, argumentsJson })`
     - `status()`
     - `perf()`
     - `test({ timeoutPerToolMs })`

3. Make prompt-generation adapter-agnostic in `src/core/prompt.ts`:
   - `generateToolSearchPromptXML(configuredServers)`
   - The generated prompt must instruct using **agentsbox** tools:
     - `agentsbox_search_*` then `agentsbox_execute`

4. Remove OpenCode-only side effects from core:
   - command file creation becomes **OpenCode adapter responsibility**.
   - any OpenCode SDK calls become **adapter-only**.

Verification:
- `bun test` still passes.
- Add a unit test ensuring `src/core/**` has **no imports** from:
  - `@opencode-ai/plugin`
  - `@mariozechner/pi-coding-agent`

---

# Adapter: OpenCode

## Behavior
Must match `agentsbox` behavior, but with renamed tools/commands:
- Expose tools:
  - `agentsbox_search_bm25`, `agentsbox_search_regex`, `agentsbox_execute`, `agentsbox_status`, `agentsbox_perf`, `agentsbox_test`
- Inject a system prompt snippet (OpenCode’s system transform hook).
- Provide a slash command template file:
  - `agentsbox-status.md` (invokes `agentsbox_status({})`)

## Implementation steps
1. Create `src/adapters/opencode/plugin.ts` that:
   - imports core engine
   - maps OpenCode tool definitions to engine methods
   - uses `experimental.chat.system.transform` to push prompt XML

2. Create `src/adapters/opencode/command.ts`:
   - exports canonical content for `/agentsbox-status` (markdown)

3. **No default export at package root.**
   - The OpenCode shim (created by CLI) imports `agentsbox/opencode`.

Verification:
- Smoke test in OpenCode by pointing plugin to the shim directory.

---

# Adapter: pi-mono extension

## Behavior
- Register tools via `pi.registerTool()`:
  - `agentsbox_search_bm25`, `agentsbox_search_regex`, `agentsbox_execute`, `agentsbox_status`, `agentsbox_perf`, `agentsbox_test`
- Provide commands via `pi.registerCommand()`:
  - `/agentsbox-status`
  - `/agentsbox-perf`
  - `/agentsbox-test`
- Inject the tool-search prompt via `pi.on("before_agent_start", ...)` by appending to `event.systemPrompt`.

## Implementation steps
1. Create `src/adapters/pi/extension.ts` exporting default function `(pi: ExtensionAPI) => void`.
2. Use TypeBox schemas (`@sinclair/typebox`) for tool parameters.
3. Implement `pi` commands as thin wrappers around calling agentsbox tools.
4. Keep all non-pi logic in core engine.

Verification:
- `pi -e ~/.pi/agent/extensions/agentsbox/index.ts` works.
- Running `/agentsbox-status` renders meaningful output.

---

# Agent Skill (AgentSkills)

## Goal
Provide a portable Skill folder:
- `skill/agentsbox/SKILL.md` (YAML frontmatter + instructions)
- Optional references:
  - `skill/agentsbox/references/REFERENCE.md`

## Content requirements
- Must comply with AgentSkills spec:
  - `name: agentsbox`
  - `description: ...`

## What the Skill should teach
- The “tool search tool” workflow:
  1) Always run `agentsbox_search_*` first
  2) Read schemas in results
  3) Run `agentsbox_execute` with JSON args
  4) If tools missing: run `agentsbox_status` and diagnose server connectivity

Verification:
- (Optional) use `skills-ref validate` if you add it to CI later.

---

# CLI design: init + setup wizard (frictionless)

## CLI commands

### `agentsbox init`
Creates canonical content under `~/.config/agentsbox/`:
- `config.jsonc` (created if missing)
- `integrations/opencode/command/agentsbox-status.md` (content-only, not linked)
- `skill/agentsbox/**` (copied from package bundle)

Flags:
- `--config-dir <path>` (default `~/.config/agentsbox`)
- `--dry-run`
- `--force` (overwrite existing generated files)

### `agentsbox setup opencode`
Wires OpenCode integration.

Actions:
1. Ensure `init` ran (or run it implicitly).
2. Install OpenCode plugin file:
   - copy bundled `dist/opencode.js` to:
     - `~/.config/opencode/plugins/agentsbox.js`
3. OpenCode auto-loads plugins from `~/.config/opencode/plugins/*.{js,ts}`.
   - **No** `opencode.jsonc` patching
   - **No** `file://...` plugin entries

Flags:
- `--dry-run`, `--force`

### `agentsbox setup pi`
Wires pi integration.

Actions:
1. Ensure `init` ran.
2. Create pi extension package dir:
   - `~/.config/agentsbox/integrations/pi/extension/`
   - includes `package.json` depending on `agentsbox`
   - `index.ts` imports `agentsbox/pi` and exports default
   - run dependency install in that dir
3. Symlink extension dir:
   - to `~/.pi/agent/extensions/agentsbox`
4. (Optional but recommended) Install Skill by symlink:
   - from `~/.config/agentsbox/skill/agentsbox`
   - to `~/.pi/agent/skills/agentsbox`

Flags:
- `--pi-extensions-dir <path>` (default `~/.pi/agent/extensions`)
- `--pi-skills-dir <path>` (default `~/.pi/agent/skills`)
- `--no-skill` (skip skill linking)
- `--dry-run`, `--force`, `--backup`

### `agentsbox setup skill`
Installs the Skill into a chosen skills directory (for agents that support Agent Skills).

Flags:
- `--skills-dir <path>` (prompt if missing)
- `--dry-run`, `--force`, `--backup`

### `agentsbox doctor`
Prints diagnostics:
- config path used
- config parse success
- configured MCP servers list
- connection health summary
- tool counts/index size

---

# Setup wizard interaction (non-GUI)

Requirements:
- For any setup command, if defaults do not exist (paths missing), prompt user:
  - OpenCode config path
  - pi extension directory
  - skills directory

Implementation:
- Use `node:readline/promises` for prompts.
- Provide `--yes` to accept defaults non-interactively.

---

# Filesystem operations: planning + atomic apply

## Change plan model
All commands should internally build a plan:

| action | path | details |
|---|---|---|
| mkdir | ... | recursive |
| write | ... | bytes, source template |
| patch-jsonc | ... | add plugin entry |
| symlink | ... | from → to |
| backup | ... | copy original |

## `--dry-run`
- Print plan table.
- Exit code 0.

## Apply mode
- Create backups first (if `--backup`).
- For writes: write temp + rename (atomic).
- For JSONC patches: read → edit with `jsonc-parser` edits → write temp + rename.
- For symlinks: create temp symlink name then rename when possible; handle already exists.

---

# Packaging & publishing

## package.json changes
1. `name: "agentsbox"`
2. Add `bin: { "agentsbox": "dist/cli/main.js" }`
3. Add `exports` for:
   - `"."` (core API)
   - `"./opencode"`
   - `"./pi"`
4. Ensure `files` includes:
   - `dist/**`
   - `agentsbox.schema.json`
   - `skill/**`

## Build outputs
- `bun build` should produce:
  - `dist/index.js`
  - `dist/adapters/opencode/plugin.js`
  - `dist/adapters/pi/extension.js`
  - `dist/cli/main.js`

---

# Acceptance criteria

## Functional
- OpenCode:
  - `agentsbox setup opencode` results in:
    - OpenCode plugin entry present
    - `/agentsbox-status` command present
    - agentsbox tools callable and working
    - system prompt injection present

- pi:
  - `agentsbox setup pi` results in:
    - extension auto-discovered
    - `/agentsbox-status` command works
    - agentsbox tools callable and working
    - prompt injection works via `before_agent_start`

- Skill:
  - `agentsbox setup skill --skills-dir <X>` installs valid AgentSkills folder

## DX
- `--dry-run` prints explicit change plan.
- Non-dry-run prints explicit summary of what was created/modified/symlinked.

## Safety
- No data loss: config patches are backed up when `--backup` set.
- Idempotent: running setup twice does not duplicate plugin entries or break symlinks.

---

# Open questions (to decide during implementation)
1. Dependency installer preference in integration dirs: `bun install` only vs fallback to `npm`.
2. Whether to strictly enforce server-name constraints (underscore ambiguity) vs only warn.
3. Whether `setup opencode` should also install Skill (ask interactively).
