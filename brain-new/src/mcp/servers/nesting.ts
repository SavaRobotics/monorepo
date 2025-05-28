import { MCPServerConfig } from '../types.js';
import path from 'path';

export const nestingMCP: MCPServerConfig = {
  name: 'nesting',
  description: 'DXF part nesting functionality',
  command: 'python3',
  args: ['./src/mcp_servers/nesting/simple_server.py'],
  env: {
    PYTHONPATH: path.resolve('./src'),
    OUTPUT_DIR: '/tmp/nesting_output',
    OUTPUT_NAME: 'nested_layout'
  },
  enabled: () => true // Always available since it's self-contained
};