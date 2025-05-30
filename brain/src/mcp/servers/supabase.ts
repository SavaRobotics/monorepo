import { MCPServerConfig } from '../types';

export const supabaseMCP: MCPServerConfig = {
  name: 'supabase',
  description: 'Supabase database queries via PostgREST',
  command: 'npx',
  args: [
    '@supabase/mcp-server-postgrest',
    '--apiUrl', `${process.env.SUPABASE_URL}/rest/v1`,
    '--apiKey', process.env.SUPABASE_KEY!,
    '--schema', 'public'
  ],
  env: {
    NODE_ENV: 'production'
  },
  enabled: () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
};