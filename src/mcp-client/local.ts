import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { LocalMCPServerConfig, MCPClient } from "./types";

const MINIMAL_ENV_KEYS = [
  // Common
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  // Windows (harmless on unix)
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
];

function getMinimalProcessEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of MINIMAL_ENV_KEYS) {
    const v = process.env[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Transport-like interface for DI/testing
 */
export interface Transport {
  close(): Promise<void>;
}

/**
 * Client-like interface for DI/testing
 */
export interface LocalClientLike {
  connect(transport: Transport): Promise<void>;
  listTools(): Promise<{ tools: any[] }>;
  callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<any>;
}

/**
 * Options for LocalMCPClient including DI seams for testing
 */
export interface LocalMCPClientOptions {
  /** Override Client creation for testing */
  clientFactory?: (name: string) => LocalClientLike;
  /** Override transport creation for testing */
  transportFactory?: (opts: {
    command: string;
    args: string[];
    env: Record<string, string>;
    stderr: "pipe" | "inherit" | "ignore";
  }) => Transport;
}

/**
 * Local MCP client using stdio transport
 */
export class LocalMCPClient implements MCPClient {
  private client: LocalClientLike;
  private transport: Transport | null;
  private toolsCache: any[] | null;
  private name: string;
  private config: LocalMCPServerConfig;
  private transportFactory: NonNullable<LocalMCPClientOptions["transportFactory"]>;

  constructor(config: { name: string } & LocalMCPServerConfig, options?: LocalMCPClientOptions) {
    this.transport = null;
    this.toolsCache = null;
    this.name = config.name;
    this.config = config;

    // Use provided factories or defaults
    const clientFactory =
      options?.clientFactory ??
      ((name: string) => new Client({ name: `agentsbox-client-${name}`, version: "0.1.0" }, {}));

    this.transportFactory = options?.transportFactory ?? ((opts) => new StdioClientTransport(opts));

    this.client = clientFactory(this.name);
  }

  async connect(): Promise<void> {
    if (!this.config.command || this.config.command.length === 0) {
      throw new Error(`Local MCP server ${this.name} has no command`);
    }

    const baseEnv =
      this.config.inheritProcessEnv === false
        ? getMinimalProcessEnv()
        : (process.env as Record<string, string>);

    this.transport = this.transportFactory({
      command: this.config.command[0]!,
      args: this.config.command.slice(1),
      env: {
        ...baseEnv,
        ...(this.config.environment ?? {}),
      },
      stderr: "pipe" as const,
    });

    await this.client.connect(this.transport);
  }

  async listTools(): Promise<any[]> {
    const result = await this.client.listTools();
    this.toolsCache = result.tools;
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    return this.client.callTool({
      name,
      arguments: args,
    });
  }

  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.toolsCache = null;
  }

  /**
   * Get cached tools without re-fetching
   */
  getCachedTools(): any[] | null {
    return this.toolsCache;
  }
}
