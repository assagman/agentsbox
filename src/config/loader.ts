// Use jsonc-parser ESM build to keep bundlers + Node ESM loaders happy.

import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "jsonc-parser/lib/esm/main.js";
import { z } from "zod";
import { ConfigSchema } from "./schema";

/**
 * Schema reference inserted into generated config files.
 *
 * This project is not published yet, so we keep schema resolution local:
 * - `agentsbox init` (CLI) copies `agentsbox.schema.json` next to `config.jsonc`
 * - runtime auto-create also copies the schema when needed
 */
export function getSchemaUrl(_version?: string): string {
  return "./agentsbox.schema.json";
}

function findPackageRoot(): string | null {
  // Works from:
  // - src/* (dev)
  // - dist/* (built)
  // - bundled single-file outputs (import.meta.url points at the output file)
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "agentsbox.schema.json")) || existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

async function readBundledFile(relPath: string): Promise<string | null> {
  const pkgRoot = findPackageRoot();
  if (!pkgRoot) return null;

  try {
    return await readFile(join(pkgRoot, relPath), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Generate a minimal default config.
 *
 * Intentionally creates an "empty" config (no MCP servers configured) so users
 * can manage it later.
 */
export function generateDefaultConfig(version: string): string {
  const schemaRef = getSchemaUrl(version);
  return `{
  "$schema": "${schemaRef}",
  "mcp": {
    // Add your MCP servers here
    // Example:
    // "time": {
    //   "type": "local",
    //   "command": ["uvx", "mcp-server-time"]
    // }
  },
  "settings": {
    "defaultLimit": 5,
    "initMode": "eager",
    "connection": {
      "connectTimeout": 5000,
      "requestTimeout": 30000,
      "retryAttempts": 2,
      "retryDelay": 1000
    }
  }
}
`;
}

async function ensureLocalSchemaFile(configDir: string): Promise<void> {
  const destSchemaPath = join(configDir, "agentsbox.schema.json");

  try {
    await access(destSchemaPath, constants.F_OK);
    return; // already exists
  } catch {
    // missing: continue
  }

  const schemaContent = await readBundledFile("agentsbox.schema.json");
  if (!schemaContent) return;

  try {
    await writeFile(destSchemaPath, schemaContent, "utf-8");
  } catch {
    // best-effort
  }
}

/**
 * Create default config file if it doesn't exist.
 *
 * Also ensures a local schema file exists next to the config so `$schema` can be
 * resolved without requiring npm publishing / unpkg.
 */
export async function createDefaultConfigIfMissing(
  filePath: string,
  version: string,
): Promise<boolean> {
  try {
    try {
      await access(filePath, constants.F_OK);
      return false; // already exists
    } catch {
      // missing: continue
    }

    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    // Best-effort: copy schema next to config.
    await ensureLocalSchemaFile(dir);

    const content = generateDefaultConfig(version);
    await writeFile(filePath, content, "utf-8");
    return true;
  } catch {
    // Ignore errors - non-critical
    return false;
  }
}

/**
 * Interpolate environment variables in config values
 * Handles {env:VAR_NAME} pattern
 */
function interpolateEnvVars(obj: any): any {
  if (typeof obj === "string") {
    // Replace {env:VAR_NAME} with actual env var or empty string
    return obj.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, varName) => {
      return process.env[varName] || "";
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars);
  }

  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVars(value);
    }
    return result;
  }

  return obj;
}

/**
 * Parse and validate config JSONC
 */
export function parseConfig(jsonc: string): ReturnType<typeof ConfigSchema.safeParse> {
  try {
    // Parse JSONC (handles comments and trailing commas)
    const parsed = parse(jsonc);

    // Interpolate environment variables
    const interpolated = interpolateEnvVars(parsed);

    // Validate against schema
    return ConfigSchema.safeParse(interpolated);
  } catch (error) {
    // Return Zod error for JSON parsing errors
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: `Failed to parse JSONC: ${error instanceof Error ? error.message : String(error)}`,
          path: [],
        },
      ]),
    } as any;
  }
}

/**
 * Load config from file path
 */
export async function loadConfig(
  filePath: string,
): Promise<ReturnType<typeof ConfigSchema.safeParse>> {
  try {
    const content = await readFile(filePath, "utf-8");
    return parseConfig(content);
  } catch (error) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: `Failed to read config file: ${error instanceof Error ? error.message : String(error)}`,
          path: [],
        },
      ]),
    } as any;
  }
}
