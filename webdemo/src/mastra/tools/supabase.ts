import { createTool } from '@mastra/core/tools';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

interface PartsRow {
  id: number;
  dxf_url: string;
  [key: string]: any; // Allow for other columns
}

export const getDxfUrlsTool = createTool({
  id: 'get-dxf-urls',
  description: 'Fetches all DXF URLs from the parts table in Supabase',
  inputSchema: z.object({
    supabaseUrl: z.string().describe('Supabase project URL'),
    supabaseKey: z.string().describe('Supabase anon key'),
  }),
  outputSchema: z.object({
    dxfUrls: z.array(z.string()).describe('Array of DXF URLs'),
    count: z.number().describe('Total number of DXF URLs found'),
  }),
  execute: async ({ context }) => {
    return await fetchDxfUrls(context.supabaseUrl, context.supabaseKey);
  },
});

const fetchDxfUrls = async (supabaseUrl: string, supabaseKey: string) => {
  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Query the parts table for all dxf_url values
    const { data, error } = await supabase
      .from('parts')
      .select('dxf_url')
      .not('dxf_url', 'is', null); // Filter out null values

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    if (!data) {
      return {
        dxfUrls: [],
        count: 0,
      };
    }

    // Extract DXF URLs from the response
    const dxfUrls = data
      .map((row: { dxf_url: string }) => row.dxf_url)
      .filter((url: string) => url && url.trim() !== ''); // Remove empty strings

    return {
      dxfUrls,
      count: dxfUrls.length,
    };
  } catch (error) {
    throw new Error(`Failed to fetch DXF URLs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const uploadDxfToSupabaseTool = createTool({
  id: 'upload-dxf-to-supabase',
  description: 'Uploads a DXF file to Supabase storage bucket',
  inputSchema: z.object({
    supabaseUrl: z.string().describe('Supabase project URL'),
    supabaseKey: z.string().describe('Supabase anon key'),
    dxfContent: z.string().describe('DXF file content as string'),
    filename: z.string().describe('Filename for the DXF file'),
    bucketName: z.string().default('dxffiles').describe('Storage bucket name'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    publicUrl: z.string().optional().describe('Public URL of the uploaded file'),
    error: z.string().optional(),
    path: z.string().optional().describe('Path of the file in the bucket'),
  }),
  execute: async ({ context }) => {
    const { supabaseUrl, supabaseKey, dxfContent, filename, bucketName } = context;
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    try {
      // Convert string content to Blob
      const blob = new Blob([dxfContent], { type: 'application/dxf' });
      
      // Generate a unique path with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const path = `unfolds/${timestamp}_${filename}`;
      
      // Upload file to Supabase storage
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(path, blob, {
          contentType: 'application/dxf',
          upsert: false,
        });
      
      if (error) {
        throw new Error(`Upload failed: ${error.message}`);
      }
      
      // Get the public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(path);
      
      return {
        success: true,
        publicUrl: urlData.publicUrl,
        path: path,
      };
      
    } catch (error) {
      console.error('Error uploading DXF to Supabase:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});

export const uploadNestedDxfToSupabaseTool = createTool({
  id: 'upload-nested-dxf-to-supabase',
  description: 'Downloads a nested DXF file from URL and uploads it to Supabase storage in the nested folder',
  inputSchema: z.object({
    supabaseUrl: z.string().describe('Supabase project URL'),
    supabaseKey: z.string().describe('Supabase anon key'),
    nestedDxfUrl: z.string().url().describe('URL of the nested DXF file to download and upload'),
    bucketName: z.string().default('dxffiles').describe('Storage bucket name'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    publicUrl: z.string().optional().describe('Public URL of the uploaded nested file'),
    error: z.string().optional(),
    path: z.string().optional().describe('Path of the file in the bucket'),
  }),
  execute: async ({ context }) => {
    const { supabaseUrl, supabaseKey, nestedDxfUrl, bucketName } = context;
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    try {
      // Download the nested DXF file from the URL
      console.log(`📥 Downloading nested DXF from: ${nestedDxfUrl}`);
      const response = await fetch(nestedDxfUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download nested DXF: ${response.status} ${response.statusText}`);
      }
      
      // Get the content as text (DXF files are text-based)
      const dxfContent = await response.text();
      
      // Convert string content to Blob
      const blob = new Blob([dxfContent], { type: 'application/dxf' });
      
      // Generate a unique path in the nested folder
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `nested_${timestamp}.dxf`;
      const path = `nested/${filename}`;
      
      console.log(`📤 Uploading to Supabase: ${path}`);
      
      // Upload file to Supabase storage
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(path, blob, {
          contentType: 'application/dxf',
          upsert: false,
        });
      
      if (error) {
        throw new Error(`Upload failed: ${error.message}`);
      }
      
      // Get the public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(path);
      
      console.log(`✅ Nested DXF uploaded successfully: ${urlData.publicUrl}`);
      
      return {
        success: true,
        publicUrl: urlData.publicUrl,
        path: path,
      };
      
    } catch (error) {
      console.error('Error uploading nested DXF to Supabase:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
}); 