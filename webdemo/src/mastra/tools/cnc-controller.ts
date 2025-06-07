import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface CncControllerResponse {
  success: boolean;
  message: string;
  job_id?: string;
  error?: string;
}

export const cncControllerTool = createTool({
  id: 'cnc-controller-trigger',
  description: 'Triggers G-code execution on Windows CNC machine via HTTP API',
  inputSchema: z.object({
    gcodeUrl: z.string().url().describe('URL to the G-code file to execute on CNC machine'),
    windowsComputerIp: z.string().describe('IP address of the Windows computer running Mach3'),
    port: z.number().optional().default(8000).describe('Port of the CNC controller API server'),
    timeout: z.number().optional().default(30000).describe('Request timeout in milliseconds'),
  }),
  outputSchema: z.object({
    success: z.boolean().describe('Whether the CNC job was successfully triggered'),
    message: z.string().describe('Response message from CNC controller'),
    jobId: z.string().optional().describe('Job ID assigned by CNC controller'),
    error: z.string().optional().describe('Error message if operation failed'),
    controllerUrl: z.string().describe('Full URL used to trigger the CNC controller'),
    responseStatus: z.number().describe('HTTP response status code'),
  }),
  execute: async ({ context }) => {
    const { gcodeUrl, windowsComputerIp, port = 8000, timeout = 30000 } = context;
    
    // Construct the controller URL
    const controllerUrl = `http://${windowsComputerIp}:${port}/run-gcode?url=${encodeURIComponent(gcodeUrl)}`;
    
    try {
      console.log(`🔗 Triggering CNC controller at: ${controllerUrl}`);
      console.log(`📐 G-code URL: ${gcodeUrl}`);
      
      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(controllerUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mastra-CNC-Workflow/1.0'
        },
        signal: controller.signal
      });
      
      // Clear timeout since request completed
      clearTimeout(timeoutId);
      
      const responseData = await response.json() as CncControllerResponse;
      
      if (response.ok && responseData.success) {
        console.log(`✅ CNC job triggered successfully`);
        console.log(`🆔 Job ID: ${responseData.job_id}`);
        
        return {
          success: true,
          message: responseData.message,
          jobId: responseData.job_id,
          controllerUrl,
          responseStatus: response.status,
        };
      } else {
        console.error(`❌ CNC controller error: ${responseData.message || responseData.error}`);
        
        return {
          success: false,
          message: responseData.message || 'Unknown error from CNC controller',
          error: responseData.error,
          controllerUrl,
          responseStatus: response.status,
        };
      }
      
    } catch (error) {
      let errorMessage: string;
      let isTimeout = false;
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = `Request timeout after ${timeout}ms`;
          isTimeout = true;
        } else {
          errorMessage = error.message;
        }
      } else {
        errorMessage = 'Unknown error occurred';
      }
      
      console.error(`❌ Failed to trigger CNC controller: ${errorMessage}`);
      
      return {
        success: false,
        message: isTimeout ? 'Request timed out' : 'Failed to communicate with CNC controller',
        error: errorMessage,
        controllerUrl,
        responseStatus: 0,
      };
    }
  },
}); 