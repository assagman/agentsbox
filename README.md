# agentsbox

Tool-search facade for MCP servers (OpenCode + pi integrations).

## Status

This repository is **not published to npm yet** (package.json is `private: true`).

## What it does

Instead of loading every MCP tool schema into the LLM context up-front, agentsbox exposes a tiny set of tools:

- `agentsbox_search_bm25`
- `agentsbox_search_regex`
- `agentsbox_execute`
- `agentsbox_status`
- `agentsbox_perf`
- `agentsbox_test`

Those tools search a local MCP catalog on-demand and execute discovered tools.

## Install (from source)

```bash
bun install
bun run build
```

Run the CLI via:

```bash
bun dist/cli.js --help
```

If you want an `agentsbox` binary on `$PATH`, you can `bun link`/`npm link` the package, but it’s optional.

## Quick start

### 1) Scaffold config + bundled skill

```bash
bun dist/cli.js init
```

This creates (under your XDG config dir):

- `$XDG_CONFIG_HOME/agentsbox/config.jsonc` (minimal/empty scaffold)
- `$XDG_CONFIG_HOME/agentsbox/agentsbox.schema.json` (for `$schema` editor validation)
- `$XDG_CONFIG_HOME/agentsbox/skill/agentsbox` (bundled skill)

### 2) Install integration

#### OpenCode

```bash
bun dist/cli.js setup opencode
```

Installs a shim plugin to:

- `$XDG_CONFIG_HOME/opencode/plugins/agentsbox.js`

#### pi

```bash
bun dist/cli.js setup pi
```

Registers a local pi extension by symlinking a wrapper into:

- `~/.pi/agent/extensions/agentsbox`

## Configuration

### Config file location

- Default: `$XDG_CONFIG_HOME/agentsbox/config.jsonc` (usually `~/.config/agentsbox/config.jsonc`)
- Override: `AGENTSBOX_CONFIG=/path/to/config.jsonc`

### Config format

`bun dist/cli.js init` creates an empty scaffold by default. For a full reference, see `example-config.jsonc`.

Minimal example (empty):

```jsonc
{
  "$schema": "./agentsbox.schema.json",
  "mcp": {},
  "settings": {
    "defaultLimit": 5,
    "initMode": "eager"
  }
}
```

### Env interpolation

Use `{env:VAR_NAME}` anywhere in the config:

```jsonc
{
  "mcp": {
    "tavily": {
      "type": "remote",
      "url": "https://mcp.tavily.com/mcp/",
      "headers": {
        "Authorization": "Bearer {env:TAVILY_API_KEY}"
      }
    }
  }
}
```

## Development

```bash
bun run check
bun run typecheck
bun test
```
