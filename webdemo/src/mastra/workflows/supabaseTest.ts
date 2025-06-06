import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { RuntimeContext } from '@mastra/core/di';
import { z } from 'zod';
import { getDxfUrlsTool, nestDxfTool } from '../tools';

const llm = anthropic('claude-3-5-sonnet-20240620');

const supabaseAgent = new Agent({
  name: 'Supabase Processing Agent',
  model: llm,
  instructions: `
    You are a Supabase data processing expert. You help analyze DXF URLs from the parts table.
    When you receive DXF URLs, provide insights about the data such as:
    - Total count of URLs
    - URL patterns or common domains
    - Any observations about the data quality
    - Suggestions for data organization or improvement
  `,
  tools: { getDxfUrlsTool },
});

const nestingAgent = new Agent({
  name: 'DXF Nesting Agent',
  model: llm,
  instructions: `
    You are a DXF nesting and manufacturing expert. You help analyze nesting results and provide insights about:
    - Material utilization efficiency
    - Placement optimization suggestions
    - Production recommendations
    - Cost and waste analysis
    When you receive nesting results, provide detailed analysis and actionable insights.
  `,
  tools: { nestDxfTool },
});

// Step to fetch DXF URLs from Supabase
const fetchDxfUrls = createStep({
  id: 'fetch-dxf-urls',
  description: 'Fetches DXF URLs from the parts table in Supabase using environment variables',
  inputSchema: z.object({
    sheetWidth: z.number().positive().default(1000).describe('Width of the sheet in mm'),
    sheetHeight: z.number().positive().default(500).describe('Height of the sheet in mm'),
    spacing: z.number().min(0).default(2).describe('Minimum spacing between parts in mm'),
  }),
  outputSchema: z.object({
    dxfUrls: z.array(z.string()),
    count: z.number(),
    analysis: z.string(),
    sheetWidth: z.number(),
    sheetHeight: z.number(),
    spacing: z.number(),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { sheetWidth, sheetHeight, spacing } = inputData;
    
    // Get Supabase credentials from environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL and/or SUPABASE_KEY');
    }

    console.log('🔄 Fetching DXF URLs from Supabase...');
    
    // Use the tool to fetch DXF URLs
    const result = await getDxfUrlsTool.execute({
      context: {
        supabaseUrl,
        supabaseKey,
      },
      runtimeContext,
    });

    console.log(`✅ Found ${result.count} DXF URLs`);

    // Use the agent to analyze the results
    const analysisPrompt = `Analyze these DXF URLs from our parts database:

Total URLs found: ${result.count}
Sample URLs (first 10): ${JSON.stringify(result.dxfUrls.slice(0, 10))}

Please provide insights about:
1. URL patterns and structure
2. Domain distribution
3. Data quality observations
4. Suggestions for better organization
5. Any potential issues or concerns`;

    const response = await supabaseAgent.stream([
      {
        role: 'user',
        content: analysisPrompt,
      },
    ]);

    let analysisText = '';
    for await (const chunk of response.textStream) {
      analysisText += chunk;
    }

    return {
      dxfUrls: result.dxfUrls,
      count: result.count,
      analysis: analysisText,
      sheetWidth,
      sheetHeight,
      spacing,
    };
  },
});

// Step to nest the DXF parts
const nestDxfParts = createStep({
  id: 'nest-dxf-parts',
  description: 'Takes DXF URLs and nests them on a sheet using advanced packing algorithms',
  inputSchema: z.object({
    dxfUrls: z.array(z.string()).describe('Array of DXF URLs from the previous step'),
    count: z.number().describe('Number of DXF URLs (for reference)'),
    analysis: z.string().describe('Analysis from the previous step (for reference)'),
    sheetWidth: z.number().positive().describe('Width of the sheet in mm'),
    sheetHeight: z.number().positive().describe('Height of the sheet in mm'),
    spacing: z.number().min(0).describe('Minimum spacing between parts in mm'),
  }),
  outputSchema: z.object({
    // Pass through the original data
    originalDxfUrls: z.array(z.string()),
    originalCount: z.number(),
    originalAnalysis: z.string(),
    // Nesting results
    nestingResults: z.object({
      success: z.boolean(),
      nestedDxfUrl: z.string().optional(),
      utilization: z.number().optional(),
      placedParts: z.number().optional(),
      totalParts: z.number().optional(),
      message: z.string(),
      error: z.string().optional(),
      processingTime: z.number().optional(),
    }),
    // AI analysis of nesting results
    nestingAnalysis: z.string(),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { dxfUrls, count, analysis, sheetWidth, sheetHeight, spacing } = inputData;
    
    console.log(`🔄 Starting nesting process for ${dxfUrls.length} DXF files...`);
    console.log(`📐 Sheet dimensions: ${sheetWidth}x${sheetHeight}mm with ${spacing}mm spacing`);

    // Call the nesting tool with the DXF URLs
    const nestingResults = await nestDxfTool.execute({
      context: {
        dxfUrls,
        sheetWidth,
        sheetHeight,
        spacing,
      },
      runtimeContext,
    });

    const placedParts = nestingResults.placedParts || 0;
    const totalParts = nestingResults.totalParts || dxfUrls.length;
    const utilization = nestingResults.utilization || 0;
    const unfittableParts = totalParts - placedParts;

    console.log(`✅ Nesting completed: ${placedParts}/${totalParts} parts placed (${utilization.toFixed(1)}% utilization)`);

    // Use the nesting agent to analyze the results
    const nestingAnalysisPrompt = `Analyze these DXF nesting results:

Nesting Results:
- Parts successfully placed: ${placedParts}
- Parts that couldn't fit: ${unfittableParts}
- Total parts attempted: ${totalParts}
- Sheet utilization: ${utilization.toFixed(2)}%
- Status: ${nestingResults.message}
${nestingResults.error ? `- Error: ${nestingResults.error}` : ''}
${nestingResults.nestedDxfUrl ? `- Output file: ${nestingResults.nestedDxfUrl}` : ''}

Please provide detailed analysis including:
1. Efficiency assessment of the ${utilization.toFixed(1)}% utilization
2. Recommendations for improving nesting results
3. Production and cost implications
4. Suggestions for handling unfittable parts (${unfittableParts} parts)
5. Overall assessment and next steps`;

    const response = await nestingAgent.stream([
      {
        role: 'user',
        content: nestingAnalysisPrompt,
      },
    ]);

    let nestingAnalysisText = '';
    for await (const chunk of response.textStream) {
      nestingAnalysisText += chunk;
    }

    return {
      originalDxfUrls: dxfUrls,
      originalCount: count,
      originalAnalysis: analysis,
      nestingResults,
      nestingAnalysis: nestingAnalysisText,
    };
  },
});

// Create the main Supabase test workflow with nesting
const supabaseTestWorkflow = createWorkflow({
  id: 'supabase-nest-workflow',
  description: 'Fetches DXF URLs from Supabase, then nests them on a sheet using advanced algorithms',
  inputSchema: z.object({
    sheetWidth: z.number().positive().default(1000).describe('Width of the sheet in mm'),
    sheetHeight: z.number().positive().default(500).describe('Height of the sheet in mm'),
    spacing: z.number().min(0).default(2).describe('Minimum spacing between parts in mm'),
  }),
  outputSchema: z.object({
    originalDxfUrls: z.array(z.string()),
    originalCount: z.number(),
    originalAnalysis: z.string(),
    nestingResults: z.object({
      success: z.boolean(),
      nestedDxfUrl: z.string().optional(),
      utilization: z.number().optional(),
      placedParts: z.number().optional(),
      totalParts: z.number().optional(),
      message: z.string(),
      error: z.string().optional(),
      processingTime: z.number().optional(),
    }),
    nestingAnalysis: z.string(),
  }),
})
  .then(fetchDxfUrls) // Step 1: Fetch DXF URLs from Supabase (passes sheet params through)
  .then(nestDxfParts); // Step 2: Nest the DXF parts (receives all data from previous step)

supabaseTestWorkflow.commit();

export { supabaseTestWorkflow };