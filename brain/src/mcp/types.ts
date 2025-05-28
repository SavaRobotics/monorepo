import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPServerConfig {
  name: string;
  description: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: () => boolean;
}

export interface MCPServerInstance {
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport;
  tools: any[];
}

export interface MCPManager {
  servers: Map<string, MCPServerInstance>;
  startServer(config: MCPServerConfig): Promise<MCPServerInstance>;
  stopServer(name: string): Promise<void>;
  getAllTools(): any[];
  executeToolCall(toolName: string, args: Record<string, unknown>): Promise<any>;
  cleanup(): Promise<void>;
}