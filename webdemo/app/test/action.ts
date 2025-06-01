"use server";
 
import { mastra } from "../../src/mastra";
 
export async function getWeatherInfo(formData: FormData) {
  const city = formData.get("city")?.toString();
  
  if (!city) {
    return "Please provide a city name";
  }
 
  const weatherWorkflow = mastra.getWorkflow("weatherWorkflow");
  const run = weatherWorkflow.createRun();
  const result = await run.start({ 
    inputData: { city } 
  });
 
  if (result.status === "success") {
    return result.result?.activities || "Unable to fetch weather information";
  }
  
  return "Unable to fetch weather information";
}

export async function getCadUnfoldInfo(formData: FormData) {
  const cadFileUrl = formData.get("cadFileUrl")?.toString();
  const kFactorStr = formData.get("kFactor")?.toString();
  const outputFormat = formData.get("outputFormat")?.toString() as "dxf" | "step" | "both";

  if (!cadFileUrl) {
    return "Please provide a CAD file URL";
  }

  // Validate URL format
  try {
    new URL(cadFileUrl);
  } catch {
    return "Please provide a valid URL";
  }

  // Parse k-factor if provided
  const kFactor = kFactorStr ? parseFloat(kFactorStr) : 0.038;
  if (isNaN(kFactor) || kFactor < 0.01 || kFactor > 0.1) {
    return "K-factor must be between 0.01 and 0.1";
  }

  try {
    console.log(`🔧 Starting CAD unfold workflow for: ${cadFileUrl}`);
    
    const cadUnfoldWorkflow = mastra.getWorkflow("cadUnfoldTestWorkflow");
    if (!cadUnfoldWorkflow) {
      return "❌ CAD unfold workflow not found. Please check the workflow is properly registered.";
    }
    
    const run = cadUnfoldWorkflow.createRun();
    
    const result = await run.start({ 
      inputData: { 
        cadFileUrl,
        kFactor,
        outputFormat: outputFormat || "dxf"
      } 
    });

    console.log(`📊 Workflow result status: ${result.status}`);
    
    if (result.status === "success") {
      const { unfoldResult, processingNotes } = result.result || {};
      
      let response = "🔧 CAD UNFOLD RESULTS\n";
      response += "═══════════════════════\n\n";
      
      if (unfoldResult) {
        response += `📊 PROCESSING STATUS: ${unfoldResult.success ? "✅ SUCCESS" : "❌ FAILED"}\n`;
        response += `⏱️  PROCESSING TIME: ${(unfoldResult.processingTime / 1000).toFixed(2)} seconds\n`;
        response += `📁 OUTPUT FILES: ${unfoldResult.outputFiles.length} files generated\n\n`;
        
        if (unfoldResult.outputFiles.length > 0) {
          response += "📄 GENERATED FILES:\n";
          unfoldResult.outputFiles.forEach((file, index) => {
            const sizeKB = Math.round(file.content.length * 0.75 / 1024);
            response += `  ${index + 1}. ${file.filename} (${file.mimeType}, ~${sizeKB}KB)\n`;
          });
          response += "\n";
        }
        
        if (unfoldResult.logs) {
          response += "📝 PROCESS LOGS:\n";
          response += unfoldResult.logs + "\n\n";
        }
      }
      
      if (processingNotes) {
        response += "📝 PROCESSING NOTES:\n";
        response += processingNotes + "\n\n";
      }
      
      return response;
    }
    
    return `❌ Workflow failed with status: ${result.status}. ${result.status === 'failed' ? (result as any).error?.message || 'Unknown error' : ''}`;
    
  } catch (error) {
    console.error("CAD unfold workflow error:", error);
    return `Error processing CAD file: ${error instanceof Error ? error.message : String(error)}`;
  }
}