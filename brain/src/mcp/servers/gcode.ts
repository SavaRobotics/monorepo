import { MCPServerConfig } from '../types.js';
import path from 'path';

export const gcodeMCP: MCPServerConfig = {
  name: 'gcode',
  description: 'G-code generation and upload functionality',
  command: 'node',
  args: ['./dist/src/mcp_servers/gcode/server.js'],
  env: {
    CUTTER_CODER_URL: process.env.CUTTER_CODER_URL || 'http://localhost:7000',
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_KEY: process.env.SUPABASE_KEY || ''
  },
  enabled: () => true // Always available
};