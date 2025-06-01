import { createTool } from '@mastra/core/tools';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

interface PartsRow {
  id: number;
  dxf_url: string;
  [key: string]: any; // Allow for other columns
}

export const getDxfUrlsTool = createTool({
  id: 'get-dxf-urls',
  description: 'Fetches all DXF URLs from the parts table in Supabase',
  inputSchema: z.object({
    supabaseUrl: z.string().describe('Supabase project URL'),
    supabaseKey: z.string().describe('Supabase anon key'),
  }),
  outputSchema: z.object({
    dxfUrls: z.array(z.string()).describe('Array of DXF URLs'),
    count: z.number().describe('Total number of DXF URLs found'),
  }),
  execute: async ({ context }) => {
    return await fetchDxfUrls(context.supabaseUrl, context.supabaseKey);
  },
});

const fetchDxfUrls = async (supabaseUrl: string, supabaseKey: string) => {
  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Query the parts table for all dxf_url values
    const { data, error } = await supabase
      .from('parts')
      .select('dxf_url')
      .not('dxf_url', 'is', null); // Filter out null values

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    if (!data) {
      return {
        dxfUrls: [],
        count: 0,
      };
    }

    // Extract DXF URLs from the response
    const dxfUrls = data
      .map((row: { dxf_url: string }) => row.dxf_url)
      .filter((url: string) => url && url.trim() !== ''); // Remove empty strings

    return {
      dxfUrls,
      count: dxfUrls.length,
    };
  } catch (error) {
    throw new Error(`Failed to fetch DXF URLs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}; 