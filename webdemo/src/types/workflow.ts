export interface WorkflowStatus {
  stepId: string;
  stepName: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done' | 'error';
  toolCall?: string;
  progress?: number;
  timestamp: Date;
  details?: any;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep?: string;
  steps: WorkflowStatus[];
  startTime: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

export interface WorkflowStepConfig {
  id: string;
  title: string;
  icon: any;
}