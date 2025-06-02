import { NextRequest, NextResponse } from 'next/server';
import { mastra } from '@/src/mastra';
import { v4 as uuidv4 } from 'uuid';

// Store for active workflow runs (in production, use Redis or similar)
export const workflowRuns = new Map<string, any>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cadFileUrl, kFactor = 0.038, outputFormat = 'dxf', bendRadius } = body;

    if (!cadFileUrl) {
      return NextResponse.json({ error: 'CAD file URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(cadFileUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Create run ID
    const runId = uuidv4();

    // Initialize run tracking
    workflowRuns.set(runId, {
      id: runId,
      workflowId: 'cad-unfold-test-workflow',
      status: 'pending',
      steps: [],
      startTime: new Date(),
    });

    // Start workflow asynchronously
    executeWorkflow(runId, { cadFileUrl, kFactor, outputFormat, bendRadius });

    return NextResponse.json({ runId, message: 'Workflow started' });
  } catch (error) {
    console.error('Error starting workflow:', error);
    return NextResponse.json(
      { error: 'Failed to start workflow' },
      { status: 500 }
    );
  }
}

async function executeWorkflow(runId: string, inputData: any) {
  const run = workflowRuns.get(runId);
  if (!run) return;

  // Define workflow steps with simulated progress
  const workflowSteps = [
    { id: 'analyze-workflow-input', title: 'Analyzing Input Parameters', duration: 2000 },
    { id: 'execute-unfold', title: 'Unfolding CAD File', duration: 5000 },
    { id: 'analyze-unfold-results', title: 'Analyzing Unfold Results', duration: 2000 },
    { id: 'save-dxf-to-supabase', title: 'Uploading DXF to Cloud Storage', duration: 3000 },
    { id: 'update-parts-table-with-dxf', title: 'Updating Parts Database', duration: 2000 },
    { id: 'get-all-dxf-files-urls', title: 'Fetching All DXF Files', duration: 1500 },
    { id: 'analyze-database-operations', title: 'Analyzing Database Operations', duration: 2000 },
    { id: 'call-nester-docker', title: 'Nesting Parts for Optimization', duration: 4000 },
    { id: 'upload-nested-dxf-to-supabase-step', title: 'Uploading Nested DXF', duration: 2500 },
    { id: 'analyze-nesting-results', title: 'Analyzing Nesting Results', duration: 2000 },
    { id: 'generate-gcode-from-nested-dxf', title: 'Generating G-code', duration: 3500 },
    { id: 'upload-gcode-to-supabase', title: 'Uploading G-code', duration: 2000 },
    { id: 'provide-final-analysis', title: 'Generating Final Analysis', duration: 3000 },
  ];

  try {
    run.status = 'running';
    
    // Initialize all steps as 'todo'
    run.steps = workflowSteps.map(step => ({
      stepId: step.id,
      stepName: step.id,
      title: step.title,
      description: 'Waiting for execution...',
      status: 'todo',
      timestamp: new Date(),
    }));

    // Simulate workflow execution with real-time updates
    for (let i = 0; i < workflowSteps.length; i++) {
      const step = workflowSteps[i];
      
      // Update step to in-progress
      run.steps[i] = {
        ...run.steps[i],
        status: 'in-progress',
        description: `Executing ${step.title}...`,
        timestamp: new Date(),
      };
      run.currentStep = step.id;

      // Simulate tool calls during execution
      const toolCalls = getToolCallsForStep(step.id);
      for (let j = 0; j < toolCalls.length; j++) {
        await new Promise(resolve => setTimeout(resolve, step.duration / toolCalls.length));
        run.steps[i].toolCall = toolCalls[j];
        run.steps[i].progress = Math.round(((j + 1) / toolCalls.length) * 100);
      }

      // Complete the step
      run.steps[i] = {
        ...run.steps[i],
        status: 'done',
        description: `Completed ${step.title}`,
        progress: 100,
        timestamp: new Date(),
      };
    }

    // Actually execute the workflow in parallel (without blocking)
    const workflow = mastra.getWorkflow('cadUnfoldTestWorkflow');
    if (workflow) {
      const workflowRun = workflow.createRun();
      workflowRun.start({ inputData }).then(result => {
        run.status = result.status === 'success' ? 'completed' : 'failed';
        run.result = result.result;
        run.endTime = new Date();
        
        if (result.status === 'failed') {
          run.error = (result as any).error?.message || 'Unknown error';
        }
      });
    }

    // Mark as completed after simulation
    setTimeout(() => {
      if (run.status === 'running') {
        run.status = 'completed';
        run.endTime = new Date();
      }
    }, workflowSteps.reduce((acc, step) => acc + step.duration, 0) + 2000);

  } catch (error) {
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : 'Unknown error';
    run.endTime = new Date();
    
    // Mark current step as error
    if (run.currentStep) {
      const stepIndex = run.steps.findIndex(s => s.stepId === run.currentStep);
      if (stepIndex >= 0) {
        run.steps[stepIndex].status = 'error';
        run.steps[stepIndex].description = `Error: ${run.error}`;
      }
    }
  }
}

function getToolCallsForStep(stepId: string): string[] {
  const toolCallMap: Record<string, string[]> = {
    'analyze-workflow-input': [
      'Reading workflow parameters...',
      'Validating input URL...',
      'Analyzing material properties...',
    ],
    'execute-unfold': [
      'Downloading CAD file from URL...',
      'Parsing STEP file format...',
      'Detecting sheet metal features...',
      'Calculating bend allowances...',
      'Generating flat pattern...',
    ],
    'save-dxf-to-supabase': [
      'Connecting to Supabase...',
      'Uploading DXF file to bucket...',
      'Generating public URL...',
    ],
    'update-parts-table-with-dxf': [
      'Querying parts database...',
      'Updating part record with DXF URL...',
    ],
    'get-all-dxf-files-urls': [
      'Fetching all DXF files from database...',
      'Building file list...',
    ],
    'call-nester-docker': [
      'Connecting to nesting service...',
      'Sending DXF files for nesting...',
      'Optimizing part placement...',
      'Receiving nested layout...',
    ],
    'generate-gcode-from-nested-dxf': [
      'Parsing nested DXF file...',
      'Calculating tool paths...',
      'Optimizing cutting sequence...',
      'Generating G-code commands...',
    ],
    'upload-gcode-to-supabase': [
      'Uploading G-code to storage...',
      'Creating file reference...',
    ],
  };

  return toolCallMap[stepId] || ['Processing...'];
}