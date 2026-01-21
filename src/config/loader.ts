// Use jsonc-parser ESM build to keep bundlers + Node ESM loaders happy.

import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse } from "jsonc-parser/lib/esm/main.js";
import { z } from "zod";
import { ConfigSchema } from "./schema";

/** npm package name for schema URL */
const NPM_PACKAGE = "agentsbox";

/**
 * Get the JSON Schema URL
 * Uses unpkg CDN with @latest for auto-updates on npm publish
 */
export function getSchemaUrl(_version?: string): string {
  return `https://unpkg.com/${NPM_PACKAGE}@latest/agentsbox.schema.json`;
}

/**
 * Generate default config content with schema reference
 * @param version - Package version for schema URL
 * @returns JSONC string with default config
 */
export function generateDefaultConfig(version: string): string {
  const schemaUrl = getSchemaUrl(version);
  return `{
  "$schema": "${schemaUrl}",
  "mcp": {
    // Add your MCP servers here
    // Example:
    // "time": {
    //   "type": "local",
    //   "command": ["npx", "-y", "@anthropic/mcp-time"]
    // }
  },
  "settings": {
    "defaultLimit": 5,
    "initMode": "eager"
  }
}
`;
}

/**
 * Create default config file if it doesn't exist
 * @param filePath - Path to config file
 * @param version - Package version for schema URL
 * @returns true if file was created, false if it already existed
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

    // Create directory if needed
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    // Write default config
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
 * Parse and validate agentsbox.jsonc config
 * @param jsonc - JSONC string (may contain comments)
 * @returns Zod validation result
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
 * @param filePath - Path to config file
 * @returns Zod validation result
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
