import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { randomUUID } from "crypto";
import http from "http";

export const dockerUnfoldTool = createTool({
  id: "docker-freecad-unfold",
  description: "Download CAD file and unfold it using FreeCAD API endpoint",
  inputSchema: z.object({
    cadFileUrl: z.string().url().describe("URL to the STEP/CAD file to download and unfold"),
    kFactor: z.number().optional().default(0.038).describe("K-factor for sheet metal unfolding"),
    outputFormat: z.enum(["dxf", "step", "both"]).optional().default("dxf").describe("Output format for unfolded parts"),
    bendRadius: z.number().optional().describe("Bend radius for sheet metal operations"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    outputFiles: z.array(z.object({
      filename: z.string(),
      content: z.string().describe("Base64 encoded file content or raw DXF content"),
      mimeType: z.string(),
    })),
    logs: z.string(),
    processingTime: z.number(),
  }),
  execute: async (context) => {
    const { cadFileUrl, kFactor, outputFormat, bendRadius } = context.context;
    const startTime = Date.now();
    const sessionId = randomUUID();
    
    try {
      console.log(`Making API request to unfold CAD file: ${cadFileUrl}`);

      // Make GET request to the unfold API endpoint
      const apiUrl = `http://localhost:5001/unfold?url=${encodeURIComponent(cadFileUrl)}`;
      console.log(`API URL: ${apiUrl}`);

      const dxfContent = await makeUnfoldRequest(apiUrl);
      
      const processingTime = Date.now() - startTime;

      // Create output file object with the raw DXF content
      const outputFiles = [{
        filename: `unfold_${sessionId}.dxf`,
        content: dxfContent, // Raw DXF content, not base64 encoded
        mimeType: "application/dxf",
      }];

      return {
        success: true,
        outputFiles,
        logs: `Successfully unfolded CAD file. Generated DXF file with ${dxfContent.length} characters.`,
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("API unfold tool error:", error);
      
      return {
        success: false,
        outputFiles: [],
        logs: `Error: ${error instanceof Error ? error.message : String(error)}`,
        processingTime,
      };
    }
  },
});

// Helper function to make HTTP request to unfold API
async function makeUnfoldRequest(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`API request failed: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk.toString();
      });
      
      response.on('end', () => {
        if (!data.trim()) {
          reject(new Error('Received empty response from unfold API'));
          return;
        }
        resolve(data);
      });
      
      response.on('error', (error) => {
        reject(new Error(`Response error: ${error.message}`));
      });
    });

    request.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    // Set timeout (e.g., 2 minutes for processing)
    request.setTimeout(2 * 60 * 1000, () => {
      request.destroy();
      reject(new Error("API request timed out"));
    });
  });
} 