# Development Guide

## Current Version

**Version:** 0.1.0

This is the initial release of agentsbox, providing a tool-search facade for MCP servers with OpenCode and pi integrations.

---

## Development Setup

### Prerequisites

- Node.js 18+
- Bun (for local development)
- Git

### Clone Repository

```bash
git clone https://github.com/assagman/agentsbox.git
cd agentsbox
```

### Install Dependencies

```bash
bun install
```

### Build Project

```bash
bun run build
```

This compiles TypeScript sources to the `dist/` directory.

---

## Development Commands

### Linting and Formatting

```bash
# Check code quality
bun run check

# Auto-fix issues
bun run check:fix
```

Uses Biome for fast, modern linting and formatting.

### Type Checking

```bash
bun run typecheck
```

Runs TypeScript compiler in check mode without emitting files.

### Testing

```bash
# Run all tests
bun test

# Run tests with coverage
bun run test:coverage
```

Tests are located in the `test/` directory.

### Benchmarking

```bash
# Run all benchmarks
bun run bench

# Individual benchmarks
bun run bench:search
bun run bench:init
bun run bench:concurrent
```

---

## Project Structure

```
agentsbox/
├── src/
│   ├── catalog/       # Tool catalog + type definitions
│   ├── config/        # Config loading + validation
│   ├── mcp-client/    # MCP client manager (local/remote)
│   ├── search/        # BM25 + regex search implementation
│   ├── profiler/      # Performance metrics collection
│   ├── runtime.ts     # Core runtime (tool registration)
│   ├── plugin.ts      # OpenCode plugin implementation
│   ├── pi.ts          # pi extension implementation
│   └── cli.ts         # CLI (init/setup commands)
├── test/              # Test files
├── bench/             # Benchmark files
├── docs/              # Documentation
├── skill/agentsbox/   # Bundled skill for agents
├── dist/              # Built output (generated)
└── package.json
```

### Core Modules

| Module | Description |
|--------|-------------|
| `runtime.ts` | Main runtime that registers agentsbox tools |
| `plugin.ts` | OpenCode plugin integration |
| `pi.ts` | pi extension integration |
| `cli.ts` | CLI for init/setup commands |
| `catalog/` | Tool catalog management |
| `config/` | Configuration loading and validation |
| `mcp-client/` | MCP server connections (local/remote) |
| `search/` | BM25 and regex search implementations |
| `profiler/` | Performance tracking and metrics |

---

## Adding New Features

### Adding a New agentsbox Tool

agentsbox tools are implemented in the core runtime (`src/runtime.ts`) and then exposed via framework-specific integrations (`src/plugin.ts` for OpenCode, `src/pi.ts` for pi).

**Step 1: Add to Runtime Interface**

Update `AgentsboxRuntime` interface in `src/runtime.ts`:

```typescript
export type AgentsboxRuntime = {
  // ... existing tools
  myNewTool: (args: { param1: string }) => Promise<string>;
};
```

**Step 2: Implement in Runtime**

Implement the method in `createAgentsboxRuntime` function in `src/runtime.ts`:

```typescript
async function myNewTool(args: { param1: string }): Promise<string> {
  // 1. Ensure initialized
  await ensureInitialized();

  // 2. Perform logic
  return JSON.stringify({ success: true, result: "..." });
}

return {
  success: true,
  runtime: {
    // ...
    myNewTool,
  },
};
```

**Step 3: Expose in OpenCode Plugin**

Add the tool definition to `src/plugin.ts`:

```typescript
agentsbox_my_new_tool: tool({
  description: "Description...",
  args: {
    param1: tool.schema.string().describe("..."),
  },
  async execute(args) {
    const r = await ensureInitialized(); // or access runtime
    // ... logic or call runtime method if accessible
    // Note: plugin.ts currently duplicates some logic, future refactor will unify this.
  }
}),
```

**Step 4: Expose in pi Extension**

Add the tool definition to `src/pi.ts`:

```typescript
pi.registerTool({
  name: "agentsbox_my_new_tool",
  // ...
  async execute(...) {
    const r = await getRuntime();
    if (!r.success) return ...;
    const out = await r.runtime.myNewTool(params);
    return toToolResult(out);
  }
});
```

### Adding a New Search Backend

1. Create new search implementation in `src/search/` (e.g., `src/search/vector.ts`).
2. Add a new method to `AgentsboxRuntime` in `src/runtime.ts` (e.g., `searchVector`).
3. Wire it up in `createAgentsboxRuntime`.
4. Expose as `agentsbox_search_vector` in `src/plugin.ts` and `src/pi.ts`.


---

## Testing Guidelines

### Unit Tests

- Use `bun test` framework
- Mock external dependencies (MCP servers, file system)
- Test both happy paths and error cases

### Integration Tests

- Test with real MCP servers where possible
- Use test config file
- Clean up resources after tests

### Test Coverage

Aim for >80% coverage on core modules.

---

## Release Process

See [RELEASE.md](./RELEASE.md) for detailed release instructions.

Summary:
1. Update version in `package.json`
2. Update CHANGELOG
3. Tag commit
4. Publish to npm
5. Create GitHub release

---

## Code Style

We use Biome for code formatting and linting.

### Rules

- Use TypeScript for all source files
- Use ES modules (`import`/`export`)
- 2 space indentation
- No semicolons
- Single quotes for strings
- Prefer `const` over `let`
- Use explicit return types for functions

### Pre-commit Hooks

Husky runs `lint-staged` on commit, automatically formatting changed files.

---

## Debugging

### Enable Debug Logging

```bash
export AGENTSBOX_DEBUG=1
```

Set this environment variable before running your agent to see detailed logging.

### Inspect MCP Server Connections

Use the agentsbox tools from within your agent:

```javascript
// From agent/coding assistant
agentsbox_status({})
// Returns: server connections, tool counts, health status
```

### Performance Profiling

```javascript
// From agent/coding assistant
agentsbox_perf({})
// Returns: performance metrics, latencies, per-server stats
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests and linting
5. Commit with conventional commits
6. Push to your fork
7. Open a pull request

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## Questions?

- Open an issue on GitHub
- Check [ARCHITECTURE.md](docs/ARCHITECTURE.md) for deep-dive details
- See [QUICKSTART.md](../QUICKSTART.md) for usage examples
