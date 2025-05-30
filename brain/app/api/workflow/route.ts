import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowManager } from '@/src/lib/workflow-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    if (!body.prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const workflowManager = getWorkflowManager();
    
    // Check if streaming is requested
    if (body.stream) {
      // Create a streaming response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const iteration of workflowManager.streamWorkflow(body)) {
              // Send each iteration as a JSON line
              const data = JSON.stringify(iteration) + '\n';
              controller.enqueue(encoder.encode(data));
            }
            controller.close();
          } catch (error) {
            const errorData = JSON.stringify({ 
              error: error instanceof Error ? error.message : String(error) 
            }) + '\n';
            controller.enqueue(encoder.encode(errorData));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Create async workflow and return ID
      const workflowId = await workflowManager.createWorkflow({
        prompt: body.prompt,
        model: body.model,
        maxIterations: body.maxIterations,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        tools: body.tools,
      });

      return NextResponse.json({
        id: workflowId,
        status: 'processing',
        message: 'Workflow created successfully',
        statusUrl: `/api/workflow/status/${workflowId}`,
      });
    }
  } catch (error) {
    console.error('Workflow creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create workflow' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const workflowManager = getWorkflowManager();
    const workflows = workflowManager.getAllWorkflows();
    
    // Return summary of all workflows
    const summary = workflows.map(w => ({
      id: w.id,
      status: w.status,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      iterationCount: w.iterations.length,
      hasResult: !!w.result,
      error: w.error,
    }));

    return NextResponse.json({
      workflows: summary,
      count: summary.length,
    });
  } catch (error) {
    console.error('Workflow list error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list workflows' },
      { status: 500 }
    );
  }
}