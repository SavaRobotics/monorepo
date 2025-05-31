import { MCPServerConfig } from '../types';

export const unfolderServerConfig: MCPServerConfig = {
  name: 'unfolder',
  description: 'Sheet metal unfolder service for converting 3D models to flat patterns',
  command: 'node',
  args: ['./dist/src/mcp_servers/unfolder/server.js'],
  env: {
    PYTHONPATH: '/app/src',
    K_FACTOR: process.env.K_FACTOR || '0.38',
  },
  enabled: () => true, // Always enabled
};