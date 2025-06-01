import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { RuntimeContext } from '@mastra/core/di';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { dockerUnfoldTool } from '../tools/unfolder/docker-unfold-tool';
import { uploadDxfToSupabaseTool, uploadNestedDxfToSupabaseTool, updatePartDxfUrlTool, getAllDxfFilesUrlsTool } from '../tools/supabase';
import { nestDxfTool } from '../tools/nesting/nester';
import fs from 'fs/promises';
import path from 'path';

const llm = anthropic('claude-3-5-sonnet-20240620');

// Create an analysis agent that will comment on workflow progress
const analysisAgent = new Agent({
  name: 'workflow-analyst',
  instructions: `You are a technical analyst observing a CAD-to-manufacturing workflow. 
  Your job is to provide concise, insightful commentary on each step's input, output, and what's happening.
  Focus on:
  - Technical accuracy and quality assessment
  - Potential issues or improvements
  - Manufacturing considerations
  - Progress tracking
  - Data transformation quality
  
  Keep your analysis brief but informative (2-3 sentences max per comment).`,
  model: llm,
});

// Analysis step for initial input
const analyzeWorkflowInput = createStep({
  id: 'analyze-workflow-input',
  description: 'Analyzes the initial workflow input and provides commentary',
  inputSchema: z.object({
    cadFileUrl: z.string().url().describe('URL to the STEP/CAD file'),
    kFactor: z.number().min(0.01).max(0.1).optional().default(0.038).describe('K-factor for sheet metal'),
    outputFormat: z.enum(['dxf', 'step', 'both']).optional().default('dxf').describe('Output format'),
    bendRadius: z.number().positive().optional().describe('Bend radius in mm'),
  }),
  outputSchema: z.object({
    cadFileUrl: z.string().url().describe('URL to the STEP/CAD file'),
    kFactor: z.number().min(0.01).max(0.1).optional().default(0.038).describe('K-factor for sheet metal'),
    outputFormat: z.enum(['dxf', 'step', 'both']).optional().default('dxf').describe('Output format'),
    bendRadius: z.number().positive().optional().describe('Bend radius in mm'),
    analysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    console.log('🤔 Agent analyzing workflow input...');
    
    const analysis = await analysisAgent.generate([
      {
        role: 'user',
        content: `Analyze this CAD unfold workflow input:
        - CAD File URL: ${inputData.cadFileUrl}
        - K-Factor: ${inputData.kFactor || 'default (0.038)'}
        - Output Format: ${inputData.outputFormat || 'dxf'}
        - Bend Radius: ${inputData.bendRadius || 'not specified'}
        
        Provide a technical assessment of these parameters and what to expect.`
      }
    ]);

    console.log('📝 Input Analysis:', analysis.text);

    return {
      ...inputData,
      analysis: analysis.text,
    };
  },
});

// Docker unfold execution step
const executeUnfold = createStep({
  id: 'execute-unfold',
  description: 'Executes the API-based CAD unfold process',
  inputSchema: z.object({
    cadFileUrl: z.string().url().describe('URL to the STEP/CAD file'),
    kFactor: z.number().min(0.01).max(0.1).optional().default(0.038).describe('K-factor for sheet metal'),
    outputFormat: z.enum(['dxf', 'step', 'both']).optional().default('dxf').describe('Output format'),
    bendRadius: z.number().positive().optional().describe('Bend radius in mm'),
    analysis: z.string(),
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
    cadFileUrl: z.string().url(),
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
      cadFileUrl: cadFileUrl,
    };
  },
});

// Save DXF to Supabase step
const saveDxfToSupabase = createStep({
  id: 'save-dxf-to-supabase',
  description: 'Saves the DXF file directly to Supabase storage bucket',
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
    cadFileUrl: z.string().url(),
    unfoldAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    cadFileUrl: z.string().url(),
    unfoldAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, cadFileUrl, unfoldAnalysis } = inputData;
    let supabaseUrl: string | undefined;
    let uploadSuccess = false;

    // Upload DXF file if the unfold was successful
    if (unfoldResult.success && unfoldResult.outputFiles.length > 0) {
      // Find the DXF file (should be the first one)
      const dxfFile = unfoldResult.outputFiles.find(file => 
        file.mimeType === 'application/dxf' || file.filename.endsWith('.dxf')
      ) || unfoldResult.outputFiles[0];

      if (dxfFile) {
        try {
          // Get Supabase credentials from environment variables
          const supabaseProjectUrl = process.env.SUPABASE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
          const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';

          console.log('📤 Uploading DXF to Supabase storage...');
          
          // Execute the upload tool with raw DXF content
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
      supabaseUrl,
      supabaseUploadSuccess: uploadSuccess,
      cadFileUrl,
      unfoldAnalysis,
    };
  },
});

// Update parts table with DXF URL step
const updatePartsTableWithDxf = createStep({
  id: 'update-parts-table-with-dxf',
  description: 'Updates the parts table with the DXF file URL',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    cadFileUrl: z.string().url().describe('Original CAD file URL'),
    unfoldAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    unfoldAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, supabaseUrl, supabaseUploadSuccess, cadFileUrl, unfoldAnalysis } = inputData;
    let partsTableUpdateSuccess = false;
    let updatedPartId: number | undefined;

    // Only update parts table if we successfully uploaded to Supabase
    if (supabaseUploadSuccess && supabaseUrl) {
      try {
        // Extract the STEP filename from the CAD file URL
        const stepFilename = cadFileUrl.split('/').pop() || '';
        
        // Get Supabase credentials
        const supabaseProjectUrl = process.env.SUPABASE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
        const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';

        console.log(`📝 Updating parts table for STEP file: ${stepFilename}`);
        
        // Execute the update tool
        const updateResult = await updatePartDxfUrlTool.execute({
          context: {
            supabaseUrl: supabaseProjectUrl,
            supabaseKey: supabaseKey,
            stepFilename: stepFilename,
            dxfUrl: supabaseUrl,
          },
          runtimeContext: new RuntimeContext(),
        });

        if (updateResult.success) {
          partsTableUpdateSuccess = true;
          updatedPartId = updateResult.updatedPartId;
          console.log(`✅ Parts table updated successfully for part ID: ${updatedPartId}`);
        } else {
          console.error(`❌ Failed to update parts table: ${updateResult.error}`);
        }
      } catch (error) {
        console.error(`❌ Error updating parts table: ${error}`);
      }
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + 
        (partsTableUpdateSuccess 
          ? `\n📊 Parts table updated for part ID: ${updatedPartId}` 
          : ''),
      supabaseUrl,
      supabaseUploadSuccess,
      partsTableUpdateSuccess,
      updatedPartId,
      unfoldAnalysis,
    };
  },
});

// Get all DXF files URLs step
const getAllDxfFilesUrls = createStep({
  id: 'get-all-dxf-files-urls',
  description: 'Gets all DXF files URLs from the parts table',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    unfoldAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()).describe('All DXF files URLs from parts table'),
    dxfFilesCount: z.number().describe('Total count of DXF files'),
    unfoldAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, supabaseUrl, supabaseUploadSuccess, partsTableUpdateSuccess, updatedPartId, unfoldAnalysis } = inputData;
    let dxfFilesUrls: string[] = [];
    let dxfFilesCount = 0;

    try {
      // Get Supabase credentials
      const supabaseProjectUrl = process.env.SUPABASE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
      const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';

      console.log('📋 Fetching all DXF files URLs from parts table...');
      
      // Execute the tool to get all DXF files URLs
      const result = await getAllDxfFilesUrlsTool.execute({
        context: {
          supabaseUrl: supabaseProjectUrl,
          supabaseKey: supabaseKey,
        },
        runtimeContext: new RuntimeContext(),
      });

      dxfFilesUrls = result.dxfFilesUrls;
      dxfFilesCount = result.count;

      console.log(`✅ Found ${dxfFilesCount} DXF files in parts table`);
      if (dxfFilesCount > 0) {
        console.log('📐 DXF files URLs:');
        dxfFilesUrls.forEach((url, index) => {
          console.log(`  ${index + 1}. ${url}`);
        });
      }
    } catch (error) {
      console.error(`❌ Error fetching DXF files URLs: ${error}`);
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + 
        `\n\n📋 DXF Files in Database:\n• Total files: ${dxfFilesCount}` +
        (dxfFilesCount > 0 ? `\n• URLs:\n${dxfFilesUrls.map((url, i) => `  ${i + 1}. ${url}`).join('\n')}` : ''),
      supabaseUrl,
      supabaseUploadSuccess,
      partsTableUpdateSuccess,
      updatedPartId,
      dxfFilesUrls,
      dxfFilesCount,
      unfoldAnalysis,
    };
  },
});

// Call nester Docker container step - update to handle databaseAnalysis
const callNesterDocker = createStep({
  id: 'call-nester-docker',
  description: 'Calls the nester Docker container with DXF URLs to get nested DXF',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()).describe('All DXF files URLs from parts table'),
    dxfFilesCount: z.number().describe('Total count of DXF files'),
    databaseAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional().describe('Raw content of the nested DXF file'),
    nestedDxfSuccess: z.boolean(),
    databaseAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, supabaseUrl, supabaseUploadSuccess, partsTableUpdateSuccess, updatedPartId, dxfFilesUrls, dxfFilesCount, databaseAnalysis } = inputData;
    let nestedDxfContent: string | undefined;
    let nestedDxfSuccess = false;

    // Only call nester if we have DXF URLs
    if (dxfFilesUrls.length > 0) {
      try {
        console.log('🔧 Calling nester Docker container...');
        
        // Construct the URL with DXF URLs as query parameter
        const nesterUrl = `http://127.0.0.1:5002/nest?urls=${dxfFilesUrls.join(',')}`;
        
        console.log(`📡 Request URL: ${nesterUrl}`);
        
        // Make GET request to nester Docker container
        const response = await fetch(nesterUrl);
        
        if (!response.ok) {
          throw new Error(`Nester API error: ${response.status} ${response.statusText}`);
        }
        
        // Get the nested DXF content
        nestedDxfContent = await response.text();
        nestedDxfSuccess = true;
        
        console.log(`✅ Received nested DXF file (${Math.round(nestedDxfContent.length / 1024)}KB)`);
        console.log(`📐 Nested DXF preview: ${nestedDxfContent.substring(0, 100)}...`);
        
      } catch (error) {
        console.error(`❌ Error calling nester Docker container: ${error}`);
      }
    } else {
      console.log('⚠️ No DXF URLs available for nesting');
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + 
        (nestedDxfSuccess 
          ? `\n\n🔧 Nesting Results:\n• Success: ✅\n• Nested DXF size: ${Math.round((nestedDxfContent?.length || 0) / 1024)}KB`
          : '\n\n🔧 Nesting Results:\n• Success: ❌'),
      supabaseUrl,
      supabaseUploadSuccess,
      partsTableUpdateSuccess,
      updatedPartId,
      dxfFilesUrls,
      dxfFilesCount,
      nestedDxfContent,
      nestedDxfSuccess,
      databaseAnalysis,
    };
  },
});

// Upload nested DXF to Supabase step - update to handle databaseAnalysis
const uploadNestedDxfToSupabaseStep = createStep({
  id: 'upload-nested-dxf-to-supabase-step',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    databaseAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    databaseAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { 
      unfoldResult, 
      processingNotes, 
      supabaseUrl, 
      supabaseUploadSuccess, 
      partsTableUpdateSuccess, 
      updatedPartId, 
      dxfFilesUrls, 
      dxfFilesCount,
      nestedDxfContent,
      nestedDxfSuccess,
      databaseAnalysis
    } = inputData;
    
    let nestedDxfUrl: string | undefined;
    let nestedDxfUploadSuccess = false;

    // Only upload if we have nested DXF content
    if (nestedDxfSuccess && nestedDxfContent) {
      try {
        // Get Supabase credentials
        const supabaseProjectUrl = process.env.SUPABASE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
        const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';

        console.log('📤 Uploading nested DXF to Supabase storage...');
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `nested_${timestamp}.dxf`;
        
        // Create Supabase client
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseProjectUrl, supabaseKey);
        
        // Convert string content to Blob
        const blob = new Blob([nestedDxfContent], { type: 'application/dxf' });
        
        // Upload to nested folder in dxffiles bucket
        const path = `nested/${filename}`;
        const { data, error } = await supabase.storage
          .from('dxffiles')
          .upload(path, blob, {
            contentType: 'application/dxf',
            upsert: false,
          });
        
        if (error) {
          throw new Error(`Upload failed: ${error.message}`);
        }
        
        // Get the public URL
        const { data: urlData } = supabase.storage
          .from('dxffiles')
          .getPublicUrl(path);
        
        nestedDxfUrl = urlData.publicUrl;
        nestedDxfUploadSuccess = true;
        
        console.log(`✅ Nested DXF uploaded to Supabase: ${nestedDxfUrl}`);
        console.log(`📏 File size: ${Math.round(nestedDxfContent.length / 1024)}KB`);
        
      } catch (error) {
        console.error(`❌ Error uploading nested DXF to Supabase: ${error}`);
      }
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + 
        (nestedDxfUploadSuccess && nestedDxfUrl
          ? `\n☁️ Nested DXF uploaded to: ${nestedDxfUrl}`
          : ''),
      supabaseUrl,
      supabaseUploadSuccess,
      partsTableUpdateSuccess,
      updatedPartId,
      dxfFilesUrls,
      dxfFilesCount,
      nestedDxfContent,
      nestedDxfSuccess,
      nestedDxfUrl,
      nestedDxfUploadSuccess,
      databaseAnalysis,
    };
  },
});

// Update Generate G-code step to handle nestingAnalysis
const generateGcodeFromNestedDxf = createStep({
  id: 'generate-gcode-from-nested-dxf',
  description: 'Generates G-code from the nested DXF file using the G-code generation API',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    nestingAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    gcodeContent: z.string().optional(),
    gcodeFilename: z.string().optional(),
    gcodeGenerationSuccess: z.boolean(),
    nestingAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { 
      unfoldResult, 
      processingNotes, 
      supabaseUrl, 
      supabaseUploadSuccess, 
      partsTableUpdateSuccess, 
      updatedPartId, 
      dxfFilesUrls, 
      dxfFilesCount,
      nestedDxfContent,
      nestedDxfSuccess,
      nestedDxfUrl,
      nestedDxfUploadSuccess,
      nestingAnalysis
    } = inputData;
    
    let gcodeContent: string | undefined;
    let gcodeFilename: string | undefined;
    let gcodeGenerationSuccess = false;

    // Only generate G-code if we have a nested DXF URL
    if (nestedDxfUploadSuccess && nestedDxfUrl) {
      try {
        console.log('🔧 Generating G-code from nested DXF...');
        
        // Encode the nested DXF URL
        const encodedUrl = encodeURIComponent(nestedDxfUrl);
        
        // Construct the G-code generation API URL (simplified API - only requires URL)
        const gcodeApiUrl = `http://localhost:9000/generate-gcode?url=${encodedUrl}`;
        
        console.log(`📡 Request URL: ${gcodeApiUrl}`);
        
        // Make GET request to G-code generation API
        const response = await fetch(gcodeApiUrl);
        
        if (!response.ok) {
          // Try to get error details from JSON response
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            throw new Error(`G-code API error: ${response.status} - ${errorData.detail || response.statusText}`);
          } else {
            throw new Error(`G-code API error: ${response.status} ${response.statusText}`);
          }
        }
        
        // Get the G-code content
        gcodeContent = await response.text();
        
        // Extract filename from Content-Disposition header if available
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename=(.+)$/);
          if (filenameMatch) {
            gcodeFilename = filenameMatch[1].replace(/"/g, '');
          }
        }
        
        if (!gcodeFilename) {
          // Generate a default filename if not provided
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          gcodeFilename = `output_${timestamp}_generated.gcode`;
        }
        
        gcodeGenerationSuccess = true;
        
        console.log(`✅ G-code generated successfully`);
        console.log(`📏 G-code size: ${Math.round(gcodeContent.length / 1024)}KB`);
        console.log(`📄 Filename: ${gcodeFilename}`);
        console.log(`📐 G-code preview: ${gcodeContent.substring(0, 200)}...`);
        
      } catch (error) {
        console.error(`❌ Error generating G-code: ${error}`);
      }
    } else {
      console.log('⚠️ No nested DXF URL available for G-code generation');
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + 
        (gcodeGenerationSuccess 
          ? `\n\n🔧 G-code Generation Results:\n• Success: ✅\n• Filename: ${gcodeFilename}\n• Size: ${Math.round((gcodeContent?.length || 0) / 1024)}KB`
          : '\n\n🔧 G-code Generation Results:\n• Success: ❌'),
      supabaseUrl,
      supabaseUploadSuccess,
      partsTableUpdateSuccess,
      updatedPartId,
      dxfFilesUrls,
      dxfFilesCount,
      nestedDxfContent,
      nestedDxfSuccess,
      nestedDxfUrl,
      nestedDxfUploadSuccess,
      gcodeContent,
      gcodeFilename,
      gcodeGenerationSuccess,
      nestingAnalysis,
    };
  },
});

// Upload G-code to Supabase step - update to handle nestingAnalysis
const uploadGcodeToSupabase = createStep({
  id: 'upload-gcode-to-supabase',
  description: 'Uploads the generated G-code file to Supabase gcodefiles bucket',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    gcodeContent: z.string().optional(),
    gcodeFilename: z.string().optional(),
    gcodeGenerationSuccess: z.boolean(),
    nestingAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    gcodeContent: z.string().optional(),
    gcodeFilename: z.string().optional(),
    gcodeGenerationSuccess: z.boolean(),
    gcodeUrl: z.string().optional(),
    gcodeUploadSuccess: z.boolean(),
    nestingAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { 
      unfoldResult, 
      processingNotes, 
      supabaseUrl, 
      supabaseUploadSuccess, 
      partsTableUpdateSuccess, 
      updatedPartId, 
      dxfFilesUrls, 
      dxfFilesCount,
      nestedDxfContent,
      nestedDxfSuccess,
      nestedDxfUrl,
      nestedDxfUploadSuccess,
      gcodeContent,
      gcodeFilename,
      gcodeGenerationSuccess,
      nestingAnalysis
    } = inputData;
    
    let gcodeUrl: string | undefined;
    let gcodeUploadSuccess = false;

    // Only upload if we have G-code content
    if (gcodeGenerationSuccess && gcodeContent && gcodeFilename) {
      try {
        // Get Supabase credentials
        const supabaseProjectUrl = process.env.SUPABASE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
        const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';

        console.log('📤 Uploading G-code to Supabase gcodefiles bucket...');
        
        // Create Supabase client
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseProjectUrl, supabaseKey);
        
        // Convert string content to Blob
        const blob = new Blob([gcodeContent], { type: 'text/plain' });
        
        // Upload to gcodefiles bucket
        const { data, error } = await supabase.storage
          .from('gcodefiles')
          .upload(gcodeFilename, blob, {
            contentType: 'text/plain',
            upsert: false,
          });
        
        if (error) {
          throw new Error(`Upload failed: ${error.message}`);
        }
        
        // Get the public URL
        const { data: urlData } = supabase.storage
          .from('gcodefiles')
          .getPublicUrl(gcodeFilename);
        
        gcodeUrl = urlData.publicUrl;
        gcodeUploadSuccess = true;
        
        console.log(`✅ G-code uploaded to Supabase: ${gcodeUrl}`);
        console.log(`📏 File size: ${Math.round(gcodeContent.length / 1024)}KB`);
        console.log(`📄 Filename: ${gcodeFilename}`);
        
      } catch (error) {
        console.error(`❌ Error uploading G-code to Supabase: ${error}`);
      }
    } else {
      console.log('⚠️ No G-code content available for upload');
    }

    return {
      unfoldResult,
      processingNotes: processingNotes + 
        (gcodeUploadSuccess && gcodeUrl
          ? `\n☁️ G-code uploaded to: ${gcodeUrl}`
          : ''),
      supabaseUrl,
      supabaseUploadSuccess,
      partsTableUpdateSuccess,
      updatedPartId,
      dxfFilesUrls,
      dxfFilesCount,
      nestedDxfContent,
      nestedDxfSuccess,
      nestedDxfUrl,
      nestedDxfUploadSuccess,
      gcodeContent,
      gcodeFilename,
      gcodeGenerationSuccess,
      gcodeUrl,
      gcodeUploadSuccess,
      nestingAnalysis,
    };
  },
});

// Analysis step for unfold results
const analyzeUnfoldResults = createStep({
  id: 'analyze-unfold-results',
  description: 'Analyzes the unfold operation results',
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
    cadFileUrl: z.string().url(),
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
    cadFileUrl: z.string().url(),
    unfoldAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    console.log('🤔 Agent analyzing unfold results...');
    
    const { unfoldResult } = inputData;
    
    const analysis = await analysisAgent.generate([
      {
        role: 'user',
        content: `Analyze these CAD unfold results:
        - Success: ${unfoldResult.success}
        - Processing Time: ${(unfoldResult.processingTime / 1000).toFixed(2)} seconds
        - Output Files: ${unfoldResult.outputFiles.length} files
        - File Details: ${unfoldResult.outputFiles.map(f => `${f.filename} (${Math.round(f.content.length / 1024)}KB)`).join(', ')}
        - Logs: ${unfoldResult.logs}
        
        Assess the quality and success of this unfold operation. What does this tell us about the CAD file and process?`
      }
    ]);

    console.log('📝 Unfold Analysis:', analysis.text);

    return {
      unfoldResult: inputData.unfoldResult,
      processingNotes: inputData.processingNotes,
      cadFileUrl: inputData.cadFileUrl,
      unfoldAnalysis: analysis.text,
    };
  },
});

// Analysis step for database operations
const analyzeDatabaseOperations = createStep({
  id: 'analyze-database-operations',
  description: 'Analyzes database storage and retrieval operations',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    unfoldAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    databaseAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    console.log('🤔 Agent analyzing database operations...');
    
    const analysis = await analysisAgent.generate([
      {
        role: 'user',
        content: `Analyze these database operations:
        - Supabase Upload Success: ${inputData.supabaseUploadSuccess}
        - Supabase URL: ${inputData.supabaseUrl || 'none'}
        - Parts Table Update Success: ${inputData.partsTableUpdateSuccess}
        - Updated Part ID: ${inputData.updatedPartId || 'none'}
        - Total DXF Files in Database: ${inputData.dxfFilesCount}
        - DXF Files URLs: ${inputData.dxfFilesUrls.length} files
        
        Assess the database operations. Are we building a good manufacturing database? Any concerns?`
      }
    ]);

    console.log('📝 Database Analysis:', analysis.text);

    return {
      ...inputData,
      databaseAnalysis: analysis.text,
    };
  },
});

// Analysis step for nesting operations
const analyzeNestingResults = createStep({
  id: 'analyze-nesting-results',
  description: 'Analyzes the nesting operation results',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    databaseAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    nestingAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    console.log('🤔 Agent analyzing nesting results...');
    
    const analysis = await analysisAgent.generate([
      {
        role: 'user',
        content: `Analyze these nesting operation results:
        - Nesting Success: ${inputData.nestedDxfSuccess}
        - Input Files Count: ${inputData.dxfFilesCount}
        - Nested DXF Size: ${inputData.nestedDxfContent ? Math.round(inputData.nestedDxfContent.length / 1024) + 'KB' : 'none'}
        - Nested DXF Upload Success: ${inputData.nestedDxfUploadSuccess}
        - Nested DXF URL: ${inputData.nestedDxfUrl || 'none'}
        
        Assess the nesting efficiency and optimization. How well did the algorithm pack the parts?`
      }
    ]);

    console.log('📝 Nesting Analysis:', analysis.text);

    return {
      ...inputData,
      nestingAnalysis: analysis.text,
    };
  },
});

// Final comprehensive analysis
const provideFinalAnalysis = createStep({
  id: 'provide-final-analysis',
  description: 'Provides final comprehensive analysis of the entire workflow',
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    gcodeContent: z.string().optional(),
    gcodeFilename: z.string().optional(),
    gcodeGenerationSuccess: z.boolean(),
    gcodeUrl: z.string().optional(),
    gcodeUploadSuccess: z.boolean(),
    nestingAnalysis: z.string(),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    gcodeContent: z.string().optional(),
    gcodeFilename: z.string().optional(),
    gcodeGenerationSuccess: z.boolean(),
    gcodeUrl: z.string().optional(),
    gcodeUploadSuccess: z.boolean(),
    finalAnalysis: z.string(),
    recommendations: z.string(),
    nestingAnalysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    console.log('🤔 Agent providing final comprehensive analysis...');
    
    const analysis = await analysisAgent.generate([
      {
        role: 'user',
        content: `Provide a comprehensive final analysis of this CAD-to-manufacturing workflow:

        WORKFLOW SUMMARY:
        - Unfold Success: ${inputData.unfoldResult.success}
        - Files Generated: ${inputData.unfoldResult.outputFiles.length}
        - Database Operations: Upload=${inputData.supabaseUploadSuccess}, Update=${inputData.partsTableUpdateSuccess}
        - Nesting Success: ${inputData.nestedDxfSuccess}
        - G-code Generation: ${inputData.gcodeGenerationSuccess}
        - G-code Upload: ${inputData.gcodeUploadSuccess}
        
        DELIVERABLES:
        - DXF File: ${inputData.supabaseUrl || 'failed'}
        - Nested DXF: ${inputData.nestedDxfUrl || 'failed'}
        - G-code File: ${inputData.gcodeUrl || 'failed'}
        
        Provide:
        1. Overall workflow assessment (success/failure and quality)
        2. Manufacturing readiness evaluation
        3. Key recommendations for improvement
        4. Next steps for production`
      }
    ]);

    console.log('📝 Final Analysis:', analysis.text);

    // Extract recommendations from the analysis
    const recommendations = await analysisAgent.generate([
      {
        role: 'user',
        content: `Based on the workflow results, provide 3-5 specific, actionable recommendations for:
        1. Process optimization
        2. Quality improvements
        3. Cost reduction
        4. Time savings
        
        Format as a bulleted list.`
      }
    ]);

    console.log('💡 Recommendations:', recommendations.text);

    return {
      ...inputData,
      finalAnalysis: analysis.text,
      recommendations: recommendations.text,
      nestingAnalysis: inputData.nestingAnalysis,
    };
  },
});

// Create the main CAD unfold test workflow
const cadUnfoldTestWorkflow = createWorkflow({
  id: 'cad-unfold-test-workflow',
  description: 'Tests the API-based CAD unfold tool with comprehensive agent analysis',
  inputSchema: z.object({
    cadFileUrl: z.string().url().describe('URL to the STEP/CAD file to unfold'),
    kFactor: z.number().min(0.01).max(0.1).optional().default(0.038).describe('K-factor for sheet metal unfolding'),
    outputFormat: z.enum(['dxf', 'step', 'both']).optional().default('dxf').describe('Output format for unfolded parts'),
    bendRadius: z.number().positive().optional().describe('Bend radius for sheet metal operations'),
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
    supabaseUrl: z.string().optional(),
    supabaseUploadSuccess: z.boolean(),
    partsTableUpdateSuccess: z.boolean(),
    updatedPartId: z.number().optional(),
    dxfFilesUrls: z.array(z.string()),
    dxfFilesCount: z.number(),
    nestedDxfContent: z.string().optional(),
    nestedDxfSuccess: z.boolean(),
    nestedDxfUrl: z.string().optional(),
    nestedDxfUploadSuccess: z.boolean(),
    gcodeContent: z.string().optional(),
    gcodeFilename: z.string().optional(),
    gcodeGenerationSuccess: z.boolean(),
    gcodeUrl: z.string().optional(),
    gcodeUploadSuccess: z.boolean(),
    finalAnalysis: z.string(),
    recommendations: z.string(),
  }),
})
  .then(analyzeWorkflowInput)     // 🤔 Agent analyzes input
  .then(executeUnfold)
  .then(analyzeUnfoldResults)     // 🤔 Agent analyzes unfold results
  .then(saveDxfToSupabase)
  .then(updatePartsTableWithDxf)
  .then(getAllDxfFilesUrls)
  .then(analyzeDatabaseOperations) // 🤔 Agent analyzes database ops
  .then(callNesterDocker)
  .then(uploadNestedDxfToSupabaseStep)
  .then(analyzeNestingResults)    // 🤔 Agent analyzes nesting
  .then(generateGcodeFromNestedDxf)
  .then(uploadGcodeToSupabase)
  .then(provideFinalAnalysis);    // 🤔 Agent provides final analysis

cadUnfoldTestWorkflow.commit();

export { cadUnfoldTestWorkflow }; 