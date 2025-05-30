import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowManager } from '@/src/lib/workflow-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workflowManager = getWorkflowManager();
    const workflow = workflowManager.getWorkflow(params.id);
    
    if (!workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // Return full workflow details
    return NextResponse.json({
      id: workflow.id,
      status: workflow.status,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      options: workflow.options,
      iterations: workflow.iterations,
      result: workflow.result,
      error: workflow.error,
    });
  } catch (error) {
    console.error('Workflow status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get workflow status' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workflowManager = getWorkflowManager();
    const deleted = workflowManager.deleteWorkflow(params.id);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Workflow deleted successfully',
      id: params.id,
    });
  } catch (error) {
    console.error('Workflow delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete workflow' },
      { status: 500 }
    );
  }
}