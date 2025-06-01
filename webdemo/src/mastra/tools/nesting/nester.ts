import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// Define the output schema for the nesting operation
const nestingOutputSchema = z.object({
  utilization_percent: z.number().describe('Percentage of sheet area utilized by placed parts'),
  placed_count: z.number().describe('Number of parts successfully placed'),
  total_parts: z.number().describe('Total number of parts attempted to nest'),
  unfittable_count: z.number().describe('Number of parts that could not be fitted'),
  nested_dxf_path: z.string().optional().describe('Path to the generated nested DXF file'),
  message: z.string().describe('Status message about the nesting operation'),
  error: z.string().optional().describe('Error message if operation failed'),
});

export const dxfNestingTool = createTool({
  id: 'nest-dxf-parts',
  description: 'Nest multiple DXF parts on a sheet using advanced packing algorithms. Downloads DXF files from URLs and arranges them efficiently to minimize waste.',
  inputSchema: z.object({
    dxfUrls: z.array(z.string().url()).min(1).describe('Array of URLs to DXF files to be nested. Duplicate URLs represent multiple quantities of the same part.'),
    sheetWidth: z.number().positive().default(1000).describe('Width of the sheet in millimeters (default: 1000mm)'),
    sheetHeight: z.number().positive().default(500).describe('Height of the sheet in millimeters (default: 500mm)'),
    spacing: z.number().min(0).default(2).describe('Minimum spacing between parts in millimeters (default: 2mm)'),
  }),
  outputSchema: nestingOutputSchema,
  execute: async ({ context }) => {
    return await nestDxfParts(
      context.dxfUrls,
      context.sheetWidth,
      context.sheetHeight,
      context.spacing
    );
  },
});

const nestDxfParts = async (
  dxfUrls: string[],
  sheetWidth: number = 1000,
  sheetHeight: number = 500,
  spacing: number = 2
): Promise<z.infer<typeof nestingOutputSchema>> => {
  try {
    // Get the path to the Python script (now in scripts directory)
    const scriptPath = path.join(process.cwd(), 'scripts', 'nesting', 'nester.py');
    
    // Prepare the input data for the Python script
    const inputData = {
      dxf_urls: dxfUrls,
      sheet_width: sheetWidth,
      sheet_height: sheetHeight,
      spacing: spacing,
    };

    // Execute the Python script
    const result = await runPythonScript(scriptPath, inputData);
    
    // Validate and return the result
    return nestingOutputSchema.parse(result);
    
  } catch (error) {
    console.error('Error in DXF nesting operation:', error);
    
    return {
      utilization_percent: 0,
      placed_count: 0,
      total_parts: dxfUrls.length,
      unfittable_count: dxfUrls.length,
      message: 'Nesting operation failed',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

const runPythonScript = async (
  scriptPath: string,
  inputData: any
): Promise<any> => {
  return new Promise((resolve, reject) => {
    // Check if the Python script exists
    fs.access(scriptPath)
      .then(() => {
        // Spawn the Python process
        const pythonProcess = spawn('python3', ['-c', `
import sys
import json
import asyncio
sys.path.insert(0, '${path.dirname(scriptPath)}')
from nester import nest_dxf_parts

async def main():
    input_data = json.loads(sys.argv[1])
    result = await nest_dxf_parts(
        input_data['dxf_urls'],
        input_data['sheet_width'],
        input_data['sheet_height'],
        input_data['spacing']
    )
    print(json.dumps(result))

if __name__ == "__main__":
    asyncio.run(main())
        `, JSON.stringify(inputData)]);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Python script failed with code ${code}: ${stderr}`));
            return;
          }

          try {
            // Parse the JSON output from the Python script
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse Python script output: ${parseError}\nOutput: ${stdout}\nError: ${stderr}`));
          }
        });

        pythonProcess.on('error', (error) => {
          reject(new Error(`Failed to start Python process: ${error.message}`));
        });
      })
      .catch((error) => {
        reject(new Error(`Python script not found at ${scriptPath}: ${error.message}`));
      });
  });
};

// Helper function to read the generated DXF file
export const readNestedDxfFile = async (filePath: string): Promise<string | null> => {
  try {
    if (!filePath) return null;
    
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error('Error reading nested DXF file:', error);
    return null;
  }
};

// Helper function to get the DXF file as a buffer for download
export const getNestedDxfBuffer = async (filePath: string): Promise<Buffer | null> => {
  try {
    if (!filePath) return null;
    
    const buffer = await fs.readFile(filePath);
    return buffer;
  } catch (error) {
    console.error('Error reading nested DXF file as buffer:', error);
    return null;
  }
}; 