import { supabaseMCP } from './supabase';
import { nestingMCP } from './nesting';
import { unfolderServerConfig } from './unfolder';
import { MCPServerConfig } from '../types';

// Export all available MCP servers
export const availableServers: MCPServerConfig[] = [
  supabaseMCP,
  nestingMCP,
  unfolderServerConfig
];

// Export individual servers for direct access if needed
export { supabaseMCP, nestingMCP, unfolderServerConfig };