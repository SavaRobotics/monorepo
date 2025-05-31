import { MCPServerConfig } from '../types';

export const gcodeMCP: MCPServerConfig = {
  name: 'gcode',
  description: 'G-code generation and upload functionality',
  command: 'node',
  args: ['./src/mcp_servers/gcode/dist/server.js'],
  env: {
    CUTTER_CODER_URL: process.env.CUTTER_CODER_URL || 'http://0.0.0.0:7777',
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_KEY: process.env.SUPABASE_KEY || ''
  },
  enabled: () => true // Always available
};