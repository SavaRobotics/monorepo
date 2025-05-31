import { supabaseMCP } from './supabase';
import { nestingMCP } from './nesting';
import { unfolderMCP } from './unfolder';
import { gcodeMCP } from './gcode';
// Export all available MCP servers
export const availableServers = [
    supabaseMCP,
    nestingMCP,
    unfolderMCP,
    gcodeMCP
];
// Export individual servers for direct access if needed
export { supabaseMCP, nestingMCP, unfolderMCP, gcodeMCP };
