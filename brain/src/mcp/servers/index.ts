import { supabaseMCP } from './supabase.js';
import { nestingMCP } from './nesting.js';
import { MCPServerConfig } from '../types.js';

// Export all available MCP servers
export const availableServers: MCPServerConfig[] = [
  supabaseMCP,
  nestingMCP
];

// Export individual servers for direct access if needed
export { supabaseMCP, nestingMCP };