import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { RuntimeContext } from '@mastra/core/di';
import { z } from 'zod';
import { dockerUnfoldTool } from '../tools/unfolder/docker-unfold-tool';
import { uploadDxfToSupabaseTool, uploadNestedDxfToSupabaseTool, updatePartDxfUrlTool, getAllDxfFilesUrlsTool } from '../tools/supabase';
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
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, cadFileUrl } = inputData;
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
            console.log(`📏 File size: ${Math.round(dxfFile.content.length / 1024)}KB`);
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
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, supabaseUrl, supabaseUploadSuccess, cadFileUrl } = inputData;
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
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, supabaseUrl, supabaseUploadSuccess, partsTableUpdateSuccess, updatedPartId } = inputData;
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
    };
  },
});

// Call nester Docker container step
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
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes, supabaseUrl, supabaseUploadSuccess, partsTableUpdateSuccess, updatedPartId, dxfFilesUrls, dxfFilesCount } = inputData;
    let nestedDxfContent: string | undefined;
    let nestedDxfSuccess = false;

    // Only call nester if we have DXF URLs
    if (dxfFilesUrls.length > 0) {
      try {
        console.log('🔧 Calling nester Docker container...');
        
        // Construct the URL with DXF URLs as query parameter
        const nesterUrl = `http://localhost:5002/nest?urls=${dxfFilesUrls.join(',')}`;
        
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
    };
  },
});

// Upload nested DXF to Supabase step
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
      nestedDxfSuccess
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
    // For testing the executeUnfold and saveDxfFile steps
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
    
    // Comment out the other properties for now since we're not running those steps
    // analysis: z.string(),
    // recommendations: z.string(),
    // dxfContent: z.string().optional(),
    // supabaseUrl: z.string().optional(),
    // supabaseUploadSuccess: z.boolean(),
    // nestingResult: z.object({
    //   success: z.boolean(),
    //   nestedDxfUrl: z.string().url().optional(),
    //   utilization: z.number().optional(),
    //   placedParts: z.number().optional(),
    //   totalParts: z.number().optional(),
    //   message: z.string(),
    //   error: z.string().optional(),
    //   processingTime: z.number().optional(),
    // }).optional(),
    // nestedSupabaseUrl: z.string().optional(),
    // nestedSupabaseUploadSuccess: z.boolean(),
  }),
})
  .then(executeUnfold)
  .then(saveDxfToSupabase)
  .then(updatePartsTableWithDxf)
  .then(getAllDxfFilesUrls)
  .then(callNesterDocker)
  .then(uploadNestedDxfToSupabaseStep)
  // Comment out the other steps for now - just testing the docker unfold and file saving
  // .then(uploadDxfToSupabase)
  // .then(nestDxfFiles)
  // .then(uploadNestedDxfToSupabase)
  // .then(analyzeResults);

cadUnfoldTestWorkflow.commit();

export { cadUnfoldTestWorkflow }; 