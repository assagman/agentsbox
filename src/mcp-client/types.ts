import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CatalogTool } from "../catalog";

export type MCPServerType = "local" | "remote";

export type LocalMCPServerConfig = {
  type: "local";
  command?: string[];
  environment?: Record<string, string>;
  /** If true, pass the full parent process.env to the child process (default: true) */
  inheritProcessEnv?: boolean;
};

export type RemoteMCPServerConfig = {
  type: "remote";
  url?: string;
  headers?: Record<string, string>;
};

export type MCPServerConfig = LocalMCPServerConfig | RemoteMCPServerConfig;

export type MCPServer = {
  name: string;
  config: MCPServerConfig;
  tools: CatalogTool[];
  status: "connecting" | "connected" | "error";
  error?: string;
};

export type MCPClient = {
  connect(): Promise<void>;
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
};
