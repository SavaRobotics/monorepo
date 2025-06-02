import { NextRequest, NextResponse } from 'next/server';
import { mastra } from '@/src/mastra';
import { v4 as uuidv4 } from 'uuid';

// Store for active workflow runs (in production, use Redis or similar)
export const workflowRuns = new Map<string, any>();

// Console log interceptor
function createLogInterceptor(runId: string) {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  const run = workflowRuns.get(runId);
  if (!run) return () => {};
  
  // Initialize logs array
  if (!run.logs) {
    run.logs = [];
  }
  
  // Override console methods
  console.log = (...args: any[]) => {
    originalLog.apply(console, args);
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    run.logs.push({
      timestamp: new Date(),
      level: 'info',
      message,
      stepId: run.currentStep
    });
  };
  
  console.error = (...args: any[]) => {
    originalError.apply(console, args);
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    run.logs.push({
      timestamp: new Date(),
      level: 'error',
      message,
      stepId: run.currentStep
    });
  };
  
  console.warn = (...args: any[]) => {
    originalWarn.apply(console, args);
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    run.logs.push({
      timestamp: new Date(),
      level: 'warn',
      message,
      stepId: run.currentStep
    });
  };
  
  // Return cleanup function
  return () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  };
}

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

  // Define workflow steps
  const workflowSteps = [
    { id: 'analyze-workflow-input', title: 'Analyzing Input Parameters' },
    { id: 'execute-unfold', title: 'Unfolding CAD File' },
    { id: 'analyze-unfold-results', title: 'Analyzing Unfold Results' },
    { id: 'save-dxf-to-supabase', title: 'Uploading DXF to Cloud Storage' },
    { id: 'update-parts-table-with-dxf', title: 'Updating Parts Database' },
    { id: 'get-all-dxf-files-urls', title: 'Fetching All DXF Files' },
    { id: 'analyze-database-operations', title: 'Analyzing Database Operations' },
    { id: 'call-nester-docker', title: 'Nesting Parts for Optimization' },
    { id: 'upload-nested-dxf-to-supabase-step', title: 'Uploading Nested DXF' },
    { id: 'analyze-nesting-results', title: 'Analyzing Nesting Results' },
    { id: 'generate-gcode-from-nested-dxf', title: 'Generating G-code' },
    { id: 'upload-gcode-to-supabase', title: 'Uploading G-code' },
    { id: 'provide-final-analysis', title: 'Generating Final Analysis' },
  ];

  // Set up log interceptor
  const cleanupLogs = createLogInterceptor(runId);

  try {
    run.status = 'running';
    run.logs = [];
    
    // Initialize all steps as 'todo'
    run.steps = workflowSteps.map(step => ({
      stepId: step.id,
      stepName: step.id,
      title: step.title,
      description: 'Waiting for execution...',
      status: 'todo',
      timestamp: new Date(),
      logs: []
    }));

    // Get the workflow
    const workflow = mastra.getWorkflow('cadUnfoldTestWorkflow');
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Create a simple step progress tracker
    let currentStepIndex = 0;
    const updateStepProgress = () => {
      if (currentStepIndex < workflowSteps.length) {
        const stepId = workflowSteps[currentStepIndex].id;
        run.currentStep = stepId;
        
        // Update step status
        run.steps[currentStepIndex] = {
          ...run.steps[currentStepIndex],
          status: 'in-progress',
          description: `Executing ${run.steps[currentStepIndex].title}...`,
          timestamp: new Date()
        };
        
        // Monitor logs for step completion indicators
        const checkStepCompletion = setInterval(() => {
          const logs = run.logs || [];
          const recentLogs = logs.slice(-10);
          
          // Check for step completion patterns
          const hasCompleted = recentLogs.some((log: any) => 
            log.message.includes('✅') || 
            log.message.includes('completed') ||
            log.message.includes('Analysis:') ||
            log.message.includes('Successfully') ||
            log.message.includes('uploaded to Supabase') ||
            log.message.includes('Completed') ||
            (log.message.includes('📝') && log.message.includes('Analysis')) // LLM analysis outputs
          );
          
          if (hasCompleted || currentStepIndex >= workflowSteps.length - 1) {
            clearInterval(checkStepCompletion);
            
            // Complete current step
            run.steps[currentStepIndex] = {
              ...run.steps[currentStepIndex],
              status: 'done',
              description: `Completed ${run.steps[currentStepIndex].title}`,
              progress: 100,
              timestamp: new Date()
            };
            
            // Move to next step
            currentStepIndex++;
            if (currentStepIndex < workflowSteps.length) {
              setTimeout(updateStepProgress, 500);
            }
          }
        }, 500);
      }
    };

    // Start tracking progress
    updateStepProgress();

    // Execute the actual workflow
    const workflowRun = workflow.createRun();
    const result = await workflowRun.start({ inputData });

    run.status = result.status === 'success' ? 'completed' : 'failed';
    if (result.status === 'success') {
      run.result = (result as any).result;
    }
    run.endTime = new Date();
    
    // Mark all remaining steps as done or error
    run.steps.forEach((step: any, index: number) => {
      if (step.status === 'todo' || step.status === 'in-progress') {
        run.steps[index] = {
          ...step,
          status: result.status === 'success' ? 'done' : 'error',
          timestamp: new Date()
        };
      }
    });
    
    if (result.status === 'failed') {
      run.error = (result as any).error?.message || 'Unknown error';
    }

  } catch (error) {
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : 'Unknown error';
    run.endTime = new Date();
    
    // Mark current step as error
    if (run.currentStep) {
      const stepIndex = run.steps.findIndex((s: any) => s.stepId === run.currentStep);
      if (stepIndex >= 0) {
        run.steps[stepIndex].status = 'error';
        run.steps[stepIndex].description = `Error: ${run.error}`;
      }
    }
  } finally {
    // Restore console methods
    cleanupLogs();
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