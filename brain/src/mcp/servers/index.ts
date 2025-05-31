import { supabaseMCP } from './supabase.js';
import { nestingMCP } from './nesting.js';
import { unfolderMCP } from './unfolder.js';
import { gcodeMCP } from './gcode.js';
import { MCPServerConfig } from '../types.js';

// Export all available MCP servers
export const availableServers: MCPServerConfig[] = [
  supabaseMCP,
  nestingMCP,
  unfolderMCP,
  gcodeMCP
];

// Export individual servers for direct access if needed
export { supabaseMCP, nestingMCP, unfolderMCP, gcodeMCP };