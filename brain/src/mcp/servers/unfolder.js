import path from 'path';
export const unfolderMCP = {
    name: 'unfolder',
    description: 'STEP to DXF unfolding functionality for sheet metal',
    command: 'python3',
    args: ['./src/mcp_servers/unfolder/server.py'],
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
