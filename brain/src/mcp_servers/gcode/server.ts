#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import fetch from 'node-fetch';

interface DxfToCutterParams {
  dxf_path?: string;
  dxf_url?: string;
  cutter_params?: Record<string, any>;
}

interface UploadGcodeParams {
  gcode_content: string;
  filename?: string;
  metadata?: Record<string, any>;
}

class GcodeServer {
  private server: Server;
  private cutterCoderUrl: string;
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor() {
    this.server = new Server(
      {
        name: 'gcode-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize from environment variables
    this.cutterCoderUrl = process.env.CUTTER_CODER_URL || 'http://localhost:7000';
    this.supabaseUrl = process.env.SUPABASE_URL || '';
    this.supabaseKey = process.env.SUPABASE_KEY || '';

    this.setupHandlers();
  }

  private setupHandlers() {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'send_dxf_to_cutter',
          description: 'Send DXF file to cutter_coder service for G-code generation',
          inputSchema: {
            type: 'object',
            properties: {
              dxf_path: {
                type: 'string',
                description: 'Local path to DXF file',
              },
              dxf_url: {
                type: 'string',
                description: 'URL to download DXF file from',
              },
              cutter_params: {
                type: 'object',
                description: 'Optional parameters for the cutter (material, thickness, etc.)',
                additionalProperties: true,
              },
            },
            oneOf: [
              { required: ['dxf_path'] },
              { required: ['dxf_url'] },
            ],
          },
        },
        {
          name: 'upload_gcode_to_supabase',
          description: 'Upload G-code file to Supabase storage',
          inputSchema: {
            type: 'object',
            properties: {
              gcode_content: {
                type: 'string',
                description: 'The G-code content to upload',
              },
              filename: {
                type: 'string',
                description: 'Optional custom filename (without extension)',
              },
              metadata: {
                type: 'object',
                description: 'Optional metadata about the G-code',
                additionalProperties: true,
              },
            },
            required: ['gcode_content'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'send_dxf_to_cutter':
          return await this.sendDxfToCutter(args as DxfToCutterParams);
        case 'upload_gcode_to_supabase':
          return await this.uploadGcodeToSupabase(args as UploadGcodeParams);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async sendDxfToCutter(params: DxfToCutterParams) {
    try {
      let dxfContent: Buffer;
      let filename: string;

      // Get DXF content either from file or URL
      if (params.dxf_path) {
        dxfContent = await fs.readFile(params.dxf_path);
        filename = path.basename(params.dxf_path);
      } else if (params.dxf_url) {
        const response = await fetch(params.dxf_url);
        if (!response.ok) {
          throw new Error(`Failed to download DXF: ${response.statusText}`);
        }
        dxfContent = Buffer.from(await response.arrayBuffer());
        filename = path.basename(new URL(params.dxf_url).pathname) || 'downloaded.dxf';
      } else {
        throw new Error('Either dxf_path or dxf_url must be provided');
      }

      // Prepare form data for multipart upload
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('dxf_file', dxfContent, {
        filename: filename,
        contentType: 'application/dxf',
      });

      // Add cutter parameters if provided
      if (params.cutter_params) {
        Object.entries(params.cutter_params).forEach(([key, value]) => {
          formData.append(key, String(value));
        });
      }

      // Send to cutter_coder service
      const response = await fetch(`${this.cutterCoderUrl}/receive_dxf_layout`, {
        method: 'POST',
        body: formData as any,
        headers: formData.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cutter service error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as any;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              gcode_content: result.gcode || result.gcode_content,
              filename: result.filename || `${path.parse(filename).name}.nc`,
              message: 'Successfully generated G-code',
              metadata: result.metadata || {},
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              message: 'Failed to generate G-code',
            }),
          },
        ],
      };
    }
  }

  private async uploadGcodeToSupabase(params: UploadGcodeParams) {
    try {
      if (!this.supabaseUrl || !this.supabaseKey) {
        throw new Error('Supabase configuration missing (SUPABASE_URL and SUPABASE_KEY required)');
      }

      // Generate filename with timestamp if not provided
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = params.filename 
        ? `${params.filename}.nc`
        : `gcode_${timestamp}.nc`;

      // Prepare the upload
      const bucket = 'gcodes';
      const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${bucket}/${filename}`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Content-Type': 'text/plain',
          'Content-Length': String(Buffer.byteLength(params.gcode_content)),
        },
        body: params.gcode_content,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      // Construct public URL
      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;

      // If metadata provided, you might want to store it in a database table
      // For now, we'll just include it in the response

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              public_url: publicUrl,
              path: filename,
              bucket: bucket,
              file_size: Buffer.byteLength(params.gcode_content),
              metadata: params.metadata || {},
              message: `Successfully uploaded G-code to Supabase: ${filename}`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              message: 'Failed to upload G-code to Supabase',
            }),
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('G-code MCP server running on stdio');
  }
}

// Main entry point
const server = new GcodeServer();
server.run().catch(console.error);