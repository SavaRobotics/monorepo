import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { RuntimeContext } from '@mastra/core/di';
import { z } from 'zod';
import { dockerUnfoldTool } from '../tools/unfolder/docker-unfold-tool';
import { uploadDxfToSupabaseTool, uploadNestedDxfToSupabaseTool } from '../tools/supabase';
import { nestDxfTool } from '../tools/nesting/nester';
import fs from 'fs/promises';
import path from 'path';

const llm = anthropic('claude-3-5-sonnet-20240620');

// Docker unfold execution step
const executeUnfold = createStep({
  id: 'execute-unfold',
  description: 'Executes the API-based CAD unfold process',
  inputSchema: z.object({
    cadFileUrl: z.string().url().describe('URL to the STEP/CAD file'),
    kFactor: z.number().min(0.01).max(0.1).optional().default(0.038).describe('K-factor for sheet metal'),
    outputFormat: z.enum(['dxf', 'step', 'both']).optional().default('dxf').describe('Output format'),
    bendRadius: z.number().positive().optional().describe('Bend radius in mm'),
  }),
  outputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { cadFileUrl, kFactor = 0.038, outputFormat = 'dxf', bendRadius } = inputData;

    console.log('🌐 Starting API CAD unfold process...');
    console.log(`📁 Processing: ${cadFileUrl}`);
    console.log('📝 Note: Ensure unfold API server is running on localhost:5001');

    // Execute the API unfold tool
    const result = await dockerUnfoldTool.execute({
      context: { cadFileUrl, kFactor, outputFormat, bendRadius },
      runtimeContext: new RuntimeContext(),
    });

    // Generate processing notes
    let notes = `API unfold process completed:\n`;
    notes += `• Success: ${result.success ? '✅ Yes' : '❌ No'}\n`;
    notes += `• Processing Time: ${(result.processingTime / 1000).toFixed(2)} seconds\n`;
    notes += `• Output Files: ${result.outputFiles.length} files generated\n`;
    notes += `• K-Factor: ${kFactor} (${kFactor < 0.035 ? 'soft material' : kFactor > 0.045 ? 'hard material' : 'typical steel'})\n`;
    notes += `• Output Format: ${outputFormat.toUpperCase()}\n`;
    if (bendRadius) {
      notes += `• Bend Radius: ${bendRadius}mm\n`;
    }

    if (result.outputFiles.length > 0) {
      notes += `\nGenerated Files:\n`;
      result.outputFiles.forEach((file, index) => {
        // For raw DXF content, calculate size directly
        const sizeKB = Math.round(file.content.length / 1024);
        notes += `  ${index + 1}. ${file.filename} (${file.mimeType}, ${sizeKB}KB)\n`;
        notes += `     Content preview: ${file.content.substring(0, 100)}...\n`;
      });
    }

    if (!result.success) {
      notes += `\n❌ Error Details:\n${result.logs}`;
    }

    return {
      unfoldResult: result,
      processingNotes: notes,
    };
  },
});

// Save DXF file step
const saveDxfFile = createStep({
  id: 'save-dxf-file',
  description: 'Saves the DXF file to local storage',
  inputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
  }),
  outputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
    savedFilePath: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes } = inputData;
    let savedFilePath: string | undefined;

    // Save DXF file if the unfold was successful
    if (unfoldResult.success && unfoldResult.outputFiles.length > 0) {
      // Find the DXF file
      const dxfFile = unfoldResult.outputFiles.find(file => 
        file.mimeType === 'application/dxf' || file.filename.endsWith('.dxf')
      );

      if (dxfFile) {
        try {
          // Create output directory
          const outputDir = path.join(process.cwd(), 'output', 'unfolded-dxf');
          await fs.mkdir(outputDir, { recursive: true });

          // Generate filename with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `unfolded_${timestamp}.dxf`;
          savedFilePath = path.join(outputDir, filename);

          // Write the DXF content to file
          await fs.writeFile(savedFilePath, dxfFile.content, 'utf-8');

          console.log(`✅ DXF file saved to: ${savedFilePath}`);
          console.log(`📏 File size: ${Math.round(dxfFile.content.length / 1024)}KB`);
        } catch (error) {
          console.error(`❌ Error saving DXF file: ${error}`);
        }
      }
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + (savedFilePath ? `\n📁 File saved to: ${savedFilePath}` : ''),
      savedFilePath,
    };
  },
});

// Upload DXF to Supabase step
const uploadDxfToSupabase = createStep({
  id: 'upload-dxf-to-supabase',
  description: 'Uploads the DXF file to Supabase storage',
  inputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
    savedFilePath: z.string().optional(),
  }),
  outputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
    savedFilePath: z.string().optional(),
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, savedFilePath } = inputData;
    let supabaseUrl: string | undefined;
    let uploadSuccess = false;

    // Upload DXF file to Supabase if unfold was successful
    if (unfoldResult.success && unfoldResult.outputFiles.length > 0) {
      // Find the DXF file
      const dxfFile = unfoldResult.outputFiles.find(file => 
        file.mimeType === 'application/dxf' || file.filename.endsWith('.dxf')
      );

      if (dxfFile) {
        try {
          // Get Supabase credentials from environment variables
          const supabaseProjectUrl = process.env.SUPABASE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
          const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';

          console.log('📤 Uploading DXF to Supabase...');
          
          // Execute the upload tool
          const uploadResult = await uploadDxfToSupabaseTool.execute({
            context: {
              supabaseUrl: supabaseProjectUrl,
              supabaseKey: supabaseKey,
              dxfContent: dxfFile.content,
              filename: dxfFile.filename,
              bucketName: 'dxffiles',
            },
            runtimeContext: new RuntimeContext(),
          });

          if (uploadResult.success && uploadResult.publicUrl) {
            supabaseUrl = uploadResult.publicUrl;
            uploadSuccess = true;
            console.log(`✅ DXF uploaded to Supabase: ${supabaseUrl}`);
          } else {
            console.error(`❌ Failed to upload to Supabase: ${uploadResult.error}`);
          }
        } catch (error) {
          console.error(`❌ Error uploading to Supabase: ${error}`);
        }
      }
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + (supabaseUrl ? `\n☁️ Uploaded to Supabase: ${supabaseUrl}` : ''),
      savedFilePath,
      supabaseUrl,
      supabaseUploadSuccess: uploadSuccess,
    };
  },
});

// Nest DXF files step
const nestDxfFiles = createStep({
  id: 'nest-dxf-files',
  description: 'Nests multiple DXF files using the nesting API',
  inputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
    savedFilePath: z.string().optional(),
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
  }),
  outputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
    savedFilePath: z.string().optional(),
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    nestingResult: z.object({
      success: z.boolean(),
      nestedDxfUrl: z.string().url().optional(),
      utilization: z.number().optional(),
      placedParts: z.number().optional(),
      totalParts: z.number().optional(),
      message: z.string(),
      error: z.string().optional(),
      processingTime: z.number().optional(),
    }).optional(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, savedFilePath, supabaseUrl, supabaseUploadSuccess } = inputData;
    let nestingResult = undefined;

    // If we have a successful upload to Supabase, we can nest it
    if (supabaseUploadSuccess && supabaseUrl) {
      try {
        console.log('🔧 Starting DXF nesting process...');
        
        // For demonstration, nest the uploaded DXF with itself
        // In a real scenario, you might collect multiple DXF URLs from different parts
        const dxfUrls = [supabaseUrl];
        
        // You could also add example URLs to nest multiple parts:
        // const dxfUrls = [
        //   supabaseUrl,
        //   'https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/dxffiles//part_43.dxf',
        //   'https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/dxffiles//part_45.dxf'
        // ];

        // Execute the nesting tool
        nestingResult = await nestDxfTool.execute({
          context: {
            dxfUrls: dxfUrls,
            sheetWidth: 1000,  // 1000mm sheet width
            sheetHeight: 500,  // 500mm sheet height
            spacing: 2,        // 2mm spacing between parts
          },
          runtimeContext: new RuntimeContext(),
        });

        if (nestingResult.success) {
          console.log(`✅ Nesting completed successfully`);
          if (nestingResult.nestedDxfUrl) {
            console.log(`📐 Nested DXF URL: ${nestingResult.nestedDxfUrl}`);
          }
          if (nestingResult.utilization !== undefined) {
            console.log(`📊 Sheet utilization: ${nestingResult.utilization}%`);
          }
        } else {
          console.error(`❌ Nesting failed: ${nestingResult.error}`);
        }
      } catch (error) {
        console.error(`❌ Error during nesting: ${error}`);
      }
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + 
        (nestingResult?.success 
          ? `\n\n🔧 Nesting Results:\n• Success: ✅\n• Utilization: ${nestingResult.utilization}%\n• Placed parts: ${nestingResult.placedParts}/${nestingResult.totalParts}\n` +
            (nestingResult.nestedDxfUrl ? `• Nested DXF: ${nestingResult.nestedDxfUrl}` : '')
          : ''),
      savedFilePath,
      supabaseUrl,
      supabaseUploadSuccess,
      nestingResult,
    };
  },
});

// Upload nested DXF to Supabase step
const uploadNestedDxfToSupabase = createStep({
  id: 'upload-nested-dxf-to-supabase',
  description: 'Uploads the nested DXF file to Supabase storage in the nested folder',
  inputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
    savedFilePath: z.string().optional(),
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    nestingResult: z.object({
      success: z.boolean(),
      nestedDxfUrl: z.string().url().optional(),
      utilization: z.number().optional(),
      placedParts: z.number().optional(),
      totalParts: z.number().optional(),
      message: z.string(),
      error: z.string().optional(),
      processingTime: z.number().optional(),
    }).optional(),
  }),
  outputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
    savedFilePath: z.string().optional(),
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    nestingResult: z.object({
      success: z.boolean(),
      nestedDxfUrl: z.string().url().optional(),
      utilization: z.number().optional(),
      placedParts: z.number().optional(),
      totalParts: z.number().optional(),
      message: z.string(),
      error: z.string().optional(),
      processingTime: z.number().optional(),
    }).optional(),
    nestedSupabaseUrl: z.string().optional(),
    nestedSupabaseUploadSuccess: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, savedFilePath, supabaseUrl, supabaseUploadSuccess, nestingResult } = inputData;
    let nestedSupabaseUrl: string | undefined;
    let nestedUploadSuccess = false;

    // If we have a successful nesting with a nested DXF URL, upload it to Supabase
    if (nestingResult?.success && nestingResult.nestedDxfUrl) {
      try {
        // Get Supabase credentials from environment variables
        const supabaseProjectUrl = process.env.SUPABASE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
        const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';

        console.log('📤 Uploading nested DXF to Supabase...');
        
        // Execute the upload tool
        const uploadResult = await uploadNestedDxfToSupabaseTool.execute({
          context: {
            supabaseUrl: supabaseProjectUrl,
            supabaseKey: supabaseKey,
            nestedDxfUrl: nestingResult.nestedDxfUrl,
            bucketName: 'dxffiles',
          },
          runtimeContext: new RuntimeContext(),
        });

        if (uploadResult.success && uploadResult.publicUrl) {
          nestedSupabaseUrl = uploadResult.publicUrl;
          nestedUploadSuccess = true;
          console.log(`✅ Nested DXF uploaded to Supabase: ${nestedSupabaseUrl}`);
        } else {
          console.error(`❌ Failed to upload nested DXF to Supabase: ${uploadResult.error}`);
        }
      } catch (error) {
        console.error(`❌ Error uploading nested DXF to Supabase: ${error}`);
      }
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + 
        (nestedSupabaseUrl ? `\n☁️ Nested DXF uploaded to Supabase: ${nestedSupabaseUrl}` : ''),
      savedFilePath,
      supabaseUrl,
      supabaseUploadSuccess,
      nestingResult,
      nestedSupabaseUrl,
      nestedSupabaseUploadSuccess: nestedUploadSuccess,
    };
  },
});

// Analysis step using direct LLM call
const analyzeResults = createStep({
  id: 'analyze-results',
  description: 'Analyzes unfold results and provides manufacturing insights',
  inputSchema: z.object({
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    processingNotes: z.string(),
    savedFilePath: z.string().optional(),
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    nestingResult: z.object({
      success: z.boolean(),
      nestedDxfUrl: z.string().url().optional(),
      utilization: z.number().optional(),
      placedParts: z.number().optional(),
      totalParts: z.number().optional(),
      message: z.string(),
      error: z.string().optional(),
      processingTime: z.number().optional(),
    }).optional(),
    nestedSupabaseUrl: z.string().optional(),
    nestedSupabaseUploadSuccess: z.boolean(),
  }),
  outputSchema: z.object({
    analysis: z.string(),
    recommendations: z.string(),
    dxfContent: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, savedFilePath, nestingResult } = inputData;

    // Extract DXF content if available
    const dxfFile = unfoldResult.outputFiles.find(file => file.mimeType === "application/dxf");
    const dxfContent = dxfFile ? dxfFile.content : null;

    const prompt = `Analyze these CAD unfold and nesting results:

UNFOLD RESULTS:
Status: ${unfoldResult.success ? 'SUCCESS' : 'FAILED'}
Processing Time: ${(unfoldResult.processingTime / 1000).toFixed(2)} seconds
Output Files: ${unfoldResult.outputFiles.length} files

${unfoldResult.outputFiles.map((file, i) => 
  `${i + 1}. ${file.filename} (${file.mimeType}, ${Math.round(file.content.length / 1024)}KB)`
).join('\n')}

${dxfContent ? `DXF Preview: ${dxfContent.substring(0, 200)}...` : 'No DXF content'}

Logs: ${unfoldResult.logs}

${nestingResult ? `
NESTING RESULTS:
Status: ${nestingResult.success ? 'SUCCESS' : 'FAILED'}
${nestingResult.utilization ? `Sheet Utilization: ${nestingResult.utilization}%` : ''}
${nestingResult.placedParts ? `Parts Placed: ${nestingResult.placedParts}/${nestingResult.totalParts}` : ''}
${nestingResult.nestedDxfUrl ? `Nested DXF URL: ${nestingResult.nestedDxfUrl}` : ''}
${nestingResult.error ? `Error: ${nestingResult.error}` : ''}
` : 'No nesting performed'}

Provide a brief analysis of what was generated and any manufacturing recommendations.`;

    // Direct LLM call without agent
    const result = await generateText({
      model: llm,
      prompt: prompt,
    });

    // Extract recommendations (simplified - you could make this more sophisticated)
    const recommendationsMatch = result.text.match(/💡 NEXT STEPS\s*\n([\s\S]*?)(?=\n\n|$)/);
    const recommendations = recommendationsMatch ? recommendationsMatch[1].trim() : 'No specific recommendations provided.';

    return {
      analysis: result.text,
      recommendations,
      dxfContent: dxfContent || undefined,
    };
  },
});

// Create the main CAD unfold test workflow
const cadUnfoldTestWorkflow = createWorkflow({
  id: 'cad-unfold-test-workflow',
  description: 'Tests the API-based CAD unfold tool with analysis',
  inputSchema: z.object({
    cadFileUrl: z.string().url().describe('URL to the STEP/CAD file to unfold'),
    kFactor: z.number().min(0.01).max(0.1).optional().default(0.038).describe('K-factor for sheet metal unfolding'),
    outputFormat: z.enum(['dxf', 'step', 'both']).optional().default('dxf').describe('Output format for unfolded parts'),
    bendRadius: z.number().positive().optional().describe('Bend radius for sheet metal operations'),
  }),
  outputSchema: z.object({
    analysis: z.string(),
    recommendations: z.string(),
    dxfContent: z.string().optional(),
    savedFilePath: z.string().optional(),
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    unfoldResult: z.object({
      success: z.boolean(),
      outputFiles: z.array(z.object({
        filename: z.string(),
        content: z.string(),
        mimeType: z.string(),
      })),
      logs: z.string(),
      processingTime: z.number(),
    }),
    nestingResult: z.object({
      success: z.boolean(),
      nestedDxfUrl: z.string().url().optional(),
      utilization: z.number().optional(),
      placedParts: z.number().optional(),
      totalParts: z.number().optional(),
      message: z.string(),
      error: z.string().optional(),
      processingTime: z.number().optional(),
    }).optional(),
    nestedSupabaseUrl: z.string().optional(),
    nestedSupabaseUploadSuccess: z.boolean(),
  }),
})
  .then(executeUnfold)
  .then(saveDxfFile)
  .then(uploadDxfToSupabase)
  .then(nestDxfFiles)
  .then(uploadNestedDxfToSupabase)
  .then(analyzeResults);

cadUnfoldTestWorkflow.commit();

export { cadUnfoldTestWorkflow }; 