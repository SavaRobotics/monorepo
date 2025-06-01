import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { RuntimeContext } from '@mastra/core/di';
import { z } from 'zod';
import { dockerUnfoldTool } from '../tools/unfolder/docker-unfold-tool';

const llm = anthropic('claude-3-5-sonnet-20240620');

const cadAgent = new Agent({
  name: 'CAD Processing Agent',
  model: llm,
  instructions: `
    You are a CAD processing and manufacturing expert. Analyze the CAD unfold results and provide insights.

    When reviewing unfold results, structure your response as follows:

    🔧 UNFOLD ANALYSIS
    ═══════════════════

    📊 PROCESSING SUMMARY
    • Status: [Success/Failed]
    • Processing Time: [X seconds]
    • Output Files: [X files generated]

    📁 OUTPUT FILES
    [For each file:]
    • File: [filename]
    • Type: [DXF/STEP/etc]
    • Size: [file size info]

    🏭 MANUFACTURING RECOMMENDATIONS
    • Material: [based on k-factor used]
    • Bend Considerations: [specific recommendations]
    • Machining Notes: [any important manufacturing considerations]

    ⚠️ QUALITY CHECKS
    • [Any issues or warnings to note]
    • [Recommendations for improvement]

    💡 NEXT STEPS
    • [Suggested actions for the manufacturer]
    • [Any additional processing needed]

    Keep recommendations practical and specific to sheet metal fabrication.
  `,
});

// Input validation step
const validateInput = createStep({
  id: 'validate-input',
  description: 'Validates CAD file URL and processing parameters',
  inputSchema: z.object({
    cadFileUrl: z.string().url().describe('URL to the STEP/CAD file'),
    kFactor: z.number().min(0.01).max(0.1).optional().default(0.038).describe('K-factor for sheet metal'),
    outputFormat: z.enum(['dxf', 'step', 'both']).optional().default('dxf').describe('Output format'),
    bendRadius: z.number().positive().optional().describe('Bend radius in mm'),
  }),
  outputSchema: z.object({
    validatedInput: z.object({
      cadFileUrl: z.string(),
      kFactor: z.number(),
      outputFormat: z.enum(['dxf', 'step', 'both']),
      bendRadius: z.number().optional(),
    }),
    validationNotes: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { cadFileUrl, kFactor = 0.038, outputFormat = 'dxf', bendRadius } = inputData;

    // Basic URL validation
    try {
      new URL(cadFileUrl);
    } catch {
      throw new Error('Invalid CAD file URL provided');
    }

    // Generate validation notes
    let notes = `Input validated successfully:\n`;
    notes += `• CAD File: ${cadFileUrl}\n`;
    notes += `• K-Factor: ${kFactor} (${kFactor < 0.035 ? 'soft material' : kFactor > 0.045 ? 'hard material' : 'typical steel'})\n`;
    notes += `• Output Format: ${outputFormat.toUpperCase()}\n`;
    if (bendRadius) {
      notes += `• Bend Radius: ${bendRadius}mm\n`;
    }

    return {
      validatedInput: {
        cadFileUrl,
        kFactor,
        outputFormat,
        bendRadius,
      },
      validationNotes: notes,
    };
  },
});

// Docker unfold execution step
const executeUnfold = createStep({
  id: 'execute-unfold',
  description: 'Executes the Docker-based CAD unfold process',
  inputSchema: z.object({
    validatedInput: z.object({
      cadFileUrl: z.string(),
      kFactor: z.number(),
      outputFormat: z.enum(['dxf', 'step', 'both']),
      bendRadius: z.number().optional(),
    }),
    validationNotes: z.string(),
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

    const { validatedInput } = inputData;

    console.log('🐳 Starting Docker CAD unfold process...');
    console.log(`📁 Processing: ${validatedInput.cadFileUrl}`);

    // Execute the Docker unfold tool
    const result = await dockerUnfoldTool.execute({
      context: validatedInput,
      runtimeContext: new RuntimeContext(),
    });

    // Generate processing notes
    let notes = `Docker unfold process completed:\n`;
    notes += `• Success: ${result.success ? '✅ Yes' : '❌ No'}\n`;
    notes += `• Processing Time: ${(result.processingTime / 1000).toFixed(2)} seconds\n`;
    notes += `• Output Files: ${result.outputFiles.length} files generated\n`;

    if (result.outputFiles.length > 0) {
      notes += `\nGenerated Files:\n`;
      result.outputFiles.forEach((file, index) => {
        const sizeKB = Math.round(file.content.length * 0.75 / 1024); // Rough base64 to bytes conversion
        notes += `  ${index + 1}. ${file.filename} (${file.mimeType}, ~${sizeKB}KB)\n`;
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

// Analysis step using the CAD agent
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
  }),
  outputSchema: z.object({
    analysis: z.string(),
    recommendations: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { unfoldResult, processingNotes } = inputData;

    const prompt = `Please analyze the following CAD unfold results and provide manufacturing insights:

PROCESSING RESULTS:
${processingNotes}

UNFOLD STATUS: ${unfoldResult.success ? 'SUCCESS' : 'FAILED'}
PROCESSING TIME: ${(unfoldResult.processingTime / 1000).toFixed(2)} seconds
OUTPUT FILES: ${unfoldResult.outputFiles.length} files

FILES GENERATED:
${unfoldResult.outputFiles.map((file, i) => 
  `${i + 1}. ${file.filename} (${file.mimeType})`
).join('\n')}

PROCESS LOGS:
${unfoldResult.logs}

Provide practical manufacturing analysis and recommendations based on these results.`;

    const response = await cadAgent.stream([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    let analysisText = '';
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      analysisText += chunk;
    }

    // Extract recommendations (simplified - you could make this more sophisticated)
    const recommendationsMatch = analysisText.match(/💡 NEXT STEPS\s*\n([\s\S]*?)(?=\n\n|$)/);
    const recommendations = recommendationsMatch ? recommendationsMatch[1].trim() : 'No specific recommendations provided.';

    return {
      analysis: analysisText,
      recommendations,
    };
  },
});

// Create the main CAD unfold test workflow
const cadUnfoldTestWorkflow = createWorkflow({
  id: 'cad-unfold-test-workflow',
  description: 'Tests the Docker-based CAD unfold tool with analysis',
  inputSchema: z.object({
    cadFileUrl: z.string().url().describe('URL to the STEP/CAD file to unfold'),
    kFactor: z.number().min(0.01).max(0.1).optional().default(0.038).describe('K-factor for sheet metal unfolding'),
    outputFormat: z.enum(['dxf', 'step', 'both']).optional().default('dxf').describe('Output format for unfolded parts'),
    bendRadius: z.number().positive().optional().describe('Bend radius for sheet metal operations'),
  }),
  outputSchema: z.object({
    analysis: z.string(),
    recommendations: z.string(),
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
  }),
})
  .then(validateInput)
  .then(executeUnfold)
  .then(analyzeResults);

cadUnfoldTestWorkflow.commit();

export { cadUnfoldTestWorkflow }; 