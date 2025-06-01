import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Define the output schema for the nesting operation
const nestingOutputSchema = z.object({
  success: z.boolean(),
  nestedDxfUrl: z.string().url().optional(),
  utilization: z.number().optional(),
  placedParts: z.number().optional(),
  totalParts: z.number().optional(),
  message: z.string(),
  error: z.string().optional(),
  processingTime: z.number().optional(),
});

export const nestDxfTool = createTool({
  id: 'nest-dxf-parts',
  description: 'Nest multiple DXF parts on a sheet by making a GET request to the nesting API',
  inputSchema: z.object({
    dxfUrls: z.array(z.string().url()).min(1).describe('Array of URLs to DXF files to be nested'),
    sheetWidth: z.number().positive().default(1000).describe('Width of the sheet in millimeters'),
    sheetHeight: z.number().positive().default(500).describe('Height of the sheet in millimeters'),
    spacing: z.number().min(0).default(2).describe('Minimum spacing between parts in millimeters'),
  }),
  outputSchema: nestingOutputSchema,
  execute: async ({ context }) => {
    const { dxfUrls, sheetWidth, sheetHeight, spacing } = context;
    
    try {
      // Join URLs with comma for query parameter
      const urlsParam = dxfUrls.join(',');
      
      // Build the API URL with query parameters
      const apiUrl = new URL('http://localhost:5002/nest');
      apiUrl.searchParams.append('urls', urlsParam);
      if (sheetWidth) apiUrl.searchParams.append('sheet_width', sheetWidth.toString());
      if (sheetHeight) apiUrl.searchParams.append('sheet_height', sheetHeight.toString());
      if (spacing) apiUrl.searchParams.append('spacing', spacing.toString());
      
      console.log(`🔗 Calling nesting API: ${apiUrl.toString()}`);
      
      const startTime = Date.now();
      
      // Make GET request to nesting API
      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Nesting API error: ${response.status} - ${errorText}`);
        return {
          success: false,
          message: 'Nesting operation failed',
          error: `API error: ${response.status} - ${errorText}`,
          totalParts: dxfUrls.length,
          processingTime,
        };
      }

      const result = await response.json();
      
      console.log(`✅ Nesting completed in ${processingTime}ms`);
      
      // Map the API response to our schema
      return {
        success: true,
        nestedDxfUrl: result.nested_dxf_url || result.output_url,
        utilization: result.utilization_percent || result.utilization,
        placedParts: result.placed_count || result.placed_parts,
        totalParts: result.total_parts || dxfUrls.length,
        message: result.message || `Successfully nested ${dxfUrls.length} DXF files`,
        processingTime,
      };
    } catch (error) {
      console.error('❌ Nesting error:', error);
      return {
        success: false,
        message: 'Nesting operation failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        totalParts: dxfUrls.length,
      };
    }
  },
}); 