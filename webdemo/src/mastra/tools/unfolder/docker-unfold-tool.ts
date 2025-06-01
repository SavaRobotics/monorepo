import { createTool } from "@mastra/core/tools";
import { spawn } from "child_process";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export const dockerUnfoldTool = createTool({
  id: "docker-freecad-unfold",
  description: "Download CAD file and unfold it using FreeCAD in Docker container",
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
      content: z.string().describe("Base64 encoded file content"),
      mimeType: z.string(),
    })),
    logs: z.string(),
    processingTime: z.number(),
  }),
  execute: async (context) => {
    const { cadFileUrl, kFactor, outputFormat, bendRadius } = context.context;
    const startTime = Date.now();
    const sessionId = randomUUID();
    const tempDir = path.join(tmpdir(), `freecad-unfold-${sessionId}`);
    
    try {
      // Create temp directory
      await fs.mkdir(tempDir, { recursive: true });
      console.log(`Created temp directory: ${tempDir}`);

      // Prepare Docker command
      const dockerArgs = [
        "run",
        "--rm", // Remove container after execution
        "-v", `${tempDir}:/workspace`, // Mount temp directory
        "-e", `CAD_FILE_URL=${cadFileUrl}`,
        "-e", `K_FACTOR=${kFactor}`,
        "-e", `OUTPUT_FORMAT=${outputFormat}`,
        ...(bendRadius ? ["-e", `BEND_RADIUS=${bendRadius}`] : []),
        "freecad-unfolder:latest" // Your Docker image name
      ];

      console.log(`Running Docker command: docker ${dockerArgs.join(" ")}`);

      // Execute Docker container
      const { stdout, stderr, exitCode } = await runDockerContainer(dockerArgs);
      
      if (exitCode !== 0) {
        throw new Error(`Docker container failed with exit code ${exitCode}: ${stderr}`);
      }

      // Read output files from temp directory
      const outputFiles = await readOutputFiles(tempDir);
      
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        outputFiles,
        logs: stdout + (stderr ? `\nSTDERR: ${stderr}` : ""),
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("Docker unfold tool error:", error);
      
      return {
        success: false,
        outputFiles: [],
        logs: `Error: ${error instanceof Error ? error.message : String(error)}`,
        processingTime,
      };
    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temp directory: ${cleanupError}`);
      }
    }
  },
});

// Helper function to run Docker container
async function runDockerContainer(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve, reject) => {
    const dockerProcess = spawn("docker", args);
    
    let stdout = "";
    let stderr = "";

    dockerProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    dockerProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    dockerProcess.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    dockerProcess.on("error", (error) => {
      reject(new Error(`Failed to start Docker process: ${error.message}`));
    });

    // Set timeout (e.g., 5 minutes)
    setTimeout(() => {
      dockerProcess.kill("SIGTERM");
      reject(new Error("Docker container execution timed out"));
    }, 5 * 60 * 1000);
  });
}

// Helper function to read output files from temp directory
async function readOutputFiles(tempDir: string): Promise<Array<{
  filename: string;
  content: string;
  mimeType: string;
}>> {
  const outputFiles: Array<{
    filename: string;
    content: string;
    mimeType: string;
  }> = [];

  try {
    const files = await fs.readdir(tempDir);
    
    for (const filename of files) {
      // Skip input files and only process output files
      if (filename.startsWith("output_") || filename.endsWith(".dxf") || filename.endsWith(".step")) {
        const filePath = path.join(tempDir, filename);
        const fileContent = await fs.readFile(filePath);
        
        // Determine MIME type
        let mimeType = "application/octet-stream";
        if (filename.endsWith(".dxf")) {
          mimeType = "application/dxf";
        } else if (filename.endsWith(".step") || filename.endsWith(".stp")) {
          mimeType = "application/step";
        }

        outputFiles.push({
          filename,
          content: fileContent.toString("base64"),
          mimeType,
        });
      }
    }
  } catch (error) {
    console.warn(`Error reading output files: ${error}`);
  }

  return outputFiles;
} 