import { randomBytes } from 'crypto';
import { LLMWorkflow, WorkflowOptions, WorkflowResult, WorkflowIteration } from './llm-workflow';

export interface WorkflowStatus {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  createdAt: Date;
  updatedAt: Date;
  options: WorkflowOptions;
  result?: WorkflowResult;
  iterations: WorkflowIteration[];
  error?: string;
}

class WorkflowManager {
  private static instance: WorkflowManager;
  private workflows: Map<string, WorkflowStatus> = new Map();
  private llmWorkflow: LLMWorkflow;
  private maxWorkflows: number = 100; // Limit stored workflows

  private constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.llmWorkflow = new LLMWorkflow(apiKey);
  }

  public static getInstance(): WorkflowManager {
    if (!WorkflowManager.instance) {
      WorkflowManager.instance = new WorkflowManager();
    }
    return WorkflowManager.instance;
  }

  public async createWorkflow(options: WorkflowOptions): Promise<string> {
    const id = randomBytes(16).toString('hex');
    
    const workflow: WorkflowStatus = {
      id,
      status: 'queued',
      createdAt: new Date(),
      updatedAt: new Date(),
      options,
      iterations: [],
    };

    this.workflows.set(id, workflow);
    
    // Clean up old workflows if we exceed the limit
    if (this.workflows.size > this.maxWorkflows) {
      const oldestId = Array.from(this.workflows.entries())
        .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime())[0][0];
      this.workflows.delete(oldestId);
    }

    // Execute workflow asynchronously
    this.executeWorkflowAsync(id);

    return id;
  }

  private async executeWorkflowAsync(id: string): Promise<void> {
    const workflow = this.workflows.get(id);
    if (!workflow) return;

    try {
      // Update status to processing
      workflow.status = 'processing';
      workflow.updatedAt = new Date();

      // Execute the workflow
      const result = await this.llmWorkflow.executeWorkflow(
        workflow.options,
        (iteration) => {
          // Update iterations in real-time
          workflow.iterations.push(iteration);
          workflow.updatedAt = new Date();
        }
      );

      // Update with final result
      workflow.result = result;
      workflow.status = result.success ? 'completed' : 'error';
      workflow.error = result.error;
      workflow.updatedAt = new Date();

    } catch (error) {
      workflow.status = 'error';
      workflow.error = error instanceof Error ? error.message : String(error);
      workflow.updatedAt = new Date();
    }
  }

  public getWorkflow(id: string): WorkflowStatus | undefined {
    return this.workflows.get(id);
  }

  public getAllWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public deleteWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }

  public async *streamWorkflow(options: WorkflowOptions): AsyncGenerator<WorkflowIteration> {
    yield* this.llmWorkflow.executeWorkflowStream(options);
  }
}

export function getWorkflowManager(): WorkflowManager {
  return WorkflowManager.getInstance();
}