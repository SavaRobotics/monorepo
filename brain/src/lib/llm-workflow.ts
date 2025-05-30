import Anthropic from '@anthropic-ai/sdk';
import { getMCPManager } from './mcp-singleton';

export interface WorkflowOptions {
  prompt: string;
  model?: string;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  tools?: string[]; // Optional: limit to specific tools
}

export interface WorkflowResult {
  success: boolean;
  iterations: number;
  messages: Anthropic.MessageParam[];
  finalResponse?: string;
  error?: string;
}

export interface WorkflowIteration {
  iteration: number;
  type: 'thinking' | 'tool_use' | 'complete';
  content?: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
    result?: any;
    error?: string;
  }>;
}

export class LLMWorkflow {
  private anthropic: Anthropic;
  private mcpManager: ReturnType<typeof getMCPManager>;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }
    
    this.anthropic = new Anthropic({ apiKey });
    this.mcpManager = getMCPManager();
  }

  async executeWorkflow(
    options: WorkflowOptions,
    onIteration?: (iteration: WorkflowIteration) => void
  ): Promise<WorkflowResult> {
    const {
      prompt,
      model = 'claude-3-5-sonnet-20241022',
      maxIterations = 10,
      temperature = 0,
      maxTokens = 4096,
      tools: toolFilter
    } = options;

    // Ensure MCP manager is initialized
    if (!this.mcpManager.isInitialized()) {
      await this.mcpManager.initialize();
    }

    // Get available tools
    let allTools = this.mcpManager.getAvailableTools();
    
    // Filter tools if specified
    if (toolFilter && toolFilter.length > 0) {
      allTools = allTools.filter(tool => 
        toolFilter.some(filter => tool.name.includes(filter))
      );
    }

    if (allTools.length === 0) {
      return {
        success: false,
        iterations: 0,
        messages: [],
        error: 'No MCP tools available'
      };
    }

    // Convert MCP tools to Anthropic format
    const anthropicTools = allTools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema as any,
    }));

    // Build initial prompt with available tools
    const systemPrompt = `You have access to multiple MCP tools for various operations:

Available tools:
${allTools.map(tool => `- ${tool.name}: ${tool.description || 'No description'}`).join('\n')}

${prompt}`;

    // Initialize conversation
    const messages: Anthropic.MessageParam[] = [{
      role: 'user',
      content: systemPrompt,
    }];

    let conversationComplete = false;
    let iterations = 0;
    let finalResponse = '';

    try {
      while (!conversationComplete && iterations < maxIterations) {
        iterations++;
        
        // Notify about thinking
        onIteration?.({
          iteration: iterations,
          type: 'thinking',
          content: `Claude is thinking (iteration ${iterations})...`
        });

        // Get Claude's response
        const response = await this.anthropic.messages.create({
          model,
          messages,
          max_tokens: maxTokens,
          tools: anthropicTools,
          temperature,
        });

        // Add assistant message to history
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Check if Claude wants to use tools
        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        if (toolUses.length === 0) {
          // No more tools to use, conversation complete
          conversationComplete = true;
          const textBlocks = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map(block => block.text)
            .join('\n');
          
          finalResponse = textBlocks;
          
          onIteration?.({
            iteration: iterations,
            type: 'complete',
            content: textBlocks
          });
        } else {
          // Execute tool calls
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          const toolCallDetails: any[] = [];

          for (const toolUse of toolUses) {
            const toolCallDetail: any = {
              name: toolUse.name,
              arguments: toolUse.input
            };

            try {
              // Execute tool via MCP manager
              const result = await this.mcpManager.executeToolCall(
                toolUse.name, 
                toolUse.input as Record<string, unknown>
              );

              toolCallDetail.result = result.content;

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result.content),
              });

            } catch (error) {
              toolCallDetail.error = String(error);
              
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ error: String(error) }),
                is_error: true,
              });
            }

            toolCallDetails.push(toolCallDetail);
          }

          // Notify about tool usage
          onIteration?.({
            iteration: iterations,
            type: 'tool_use',
            toolCalls: toolCallDetails
          });

          // Add tool results to conversation
          messages.push({
            role: 'user',
            content: toolResults,
          });
        }
      }

      if (iterations >= maxIterations) {
        return {
          success: false,
          iterations,
          messages,
          error: 'Reached maximum iterations limit'
        };
      }

      return {
        success: true,
        iterations,
        messages,
        finalResponse
      };

    } catch (error) {
      return {
        success: false,
        iterations,
        messages,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async *executeWorkflowStream(options: WorkflowOptions): AsyncGenerator<WorkflowIteration> {
    const iterations: WorkflowIteration[] = [];
    
    const result = await this.executeWorkflow(options, (iteration) => {
      iterations.push(iteration);
    });

    // Yield all collected iterations
    for (const iteration of iterations) {
      yield iteration;
    }

    // Yield final error if any
    if (!result.success && result.error) {
      yield {
        iteration: result.iterations + 1,
        type: 'complete',
        content: `Error: ${result.error}`
      };
    }
  }
}