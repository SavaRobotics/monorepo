#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

// Create MCP server instance
const server = new Server(
  {
    name: 'unfolder-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the unfold tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'unfold_step_to_dxf',
        description: 'Convert a STEP file to DXF using FreeCAD sheet metal unfolder',
        inputSchema: {
          type: 'object',
          properties: {
            step_file_path: {
              type: 'string',
              description: 'Path to the STEP file to unfold',
            },
            k_factor: {
              type: 'number',
              description: 'K-factor for bend allowance calculation (default: 0.38)',
              minimum: 0.1,
              maximum: 1.0,
              default: 0.38,
            },
            output_dir: {
              type: 'string',
              description: 'Optional output directory for DXF file (defaults to temp directory)',
            },
          },
          required: ['step_file_path'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'unfold_step_to_dxf') {
    const args = request.params.arguments as any;
    
    try {
      // Validate input file exists
      const stepFilePath = args.step_file_path;
      try {
        await fs.access(stepFilePath);
      } catch {
        throw new Error(`STEP file not found: ${stepFilePath}`);
      }

      // Create temp directory for output if not specified
      const outputDir = args.output_dir || path.join(tmpdir(), `unfolder_${randomBytes(8).toString('hex')}`);
      await fs.mkdir(outputDir, { recursive: true });

      // Set up environment variables
      const env = {
        ...process.env,
        K_FACTOR: String(args.k_factor || 0.38),
        OUTPUT_DIR: outputDir,
        PYTHONPATH: process.env.PYTHONPATH || '/app/src',
      };

      // Path to the unfold.py script
      const scriptPath = path.join(__dirname, 'src', 'unfolder', 'unfold.py');
      
      // Run FreeCAD with the unfold script
      const freecadProcess = spawn('freecad', [stepFilePath, '-c', scriptPath], {
        env,
        cwd: outputDir,
      });

      let stdout = '';
      let stderr = '';

      freecadProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      freecadProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Wait for process to complete
      const exitCode = await new Promise<number>((resolve, reject) => {
        freecadProcess.on('close', (code) => {
          resolve(code || 0);
        });

        freecadProcess.on('error', (err) => {
          reject(err);
        });

        // Timeout after 2 minutes
        setTimeout(() => {
          freecadProcess.kill();
          reject(new Error('FreeCAD process timed out after 2 minutes'));
        }, 120000);
      });

      // Check if conversion was successful
      const dxfPath = path.join(outputDir, 'largest_face.dxf');
      
      if (exitCode === 0) {
        try {
          await fs.access(dxfPath);
          
          // Read DXF file content
          const dxfContent = await fs.readFile(dxfPath, 'utf-8');
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  dxf_path: dxfPath,
                  dxf_content: dxfContent,
                  output_dir: outputDir,
                  stdout,
                  message: 'STEP file successfully unfolded to DXF',
                }),
              },
            ],
          };
        } catch (error) {
          throw new Error(`DXF file not found after conversion: ${dxfPath}`);
        }
      } else {
        throw new Error(`FreeCAD conversion failed with exit code ${exitCode}. Stderr: ${stderr}`);
      }
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Unfolder MCP server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});