import { MCPServerConfig } from '../types.js';
import path from 'path';

export const unfolderMCP: MCPServerConfig = {
  name: 'unfolder',
<<<<<<< HEAD
  description: 'Sheet metal unfolder service for converting 3D models to flat patterns',
  command: 'node',
  args: ['./dist/src/mcp_servers/unfolder/server.js'],
=======
  description: 'STEP to DXF unfolding functionality for sheet metal',
  command: 'python3',
  args: ['./src/mcp_servers/unfolder/server.py'],
>>>>>>> 0e0a937653db4067389b175a797d0619fddc8916
  env: {
    PYTHONPATH: path.resolve('./src'),
    OUTPUT_DIR: '/tmp/unfolder_output',
    K_FACTOR: '0.38',
    STEP_FILE_URL: process.env.STEP_FILE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles/test.step',
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_KEY: process.env.SUPABASE_KEY || ''
  },
  enabled: () => true // Always available since it's self-contained
};