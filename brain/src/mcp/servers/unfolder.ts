import { MCPServerConfig } from '../types';

export const unfolderServerConfig: MCPServerConfig = {
  name: 'unfolder',
  command: 'node',
  args: ['./dist/src/mcp_servers/unfolder/server.js'],
  env: {
    PYTHONPATH: '/app/src',
    K_FACTOR: process.env.K_FACTOR || '0.38',
  },
  enabled: () => true, // Always enabled
};