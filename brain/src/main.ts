import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import { MCPServerManager } from './mcp/manager.js';
import { availableServers } from './mcp/servers/index.js';

// Load environment variables
dotenv.config({ path: './.env' });

async function main() {
  console.log('🚀 Starting Brain - Modular LLM with MCP servers...\n');

  // Check for required environment variables
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.error('❌ Missing required environment variable: ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // Initialize MCP manager
  const mcpManager = new MCPServerManager();

  // Setup cleanup on exit
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, cleaning up...');
    await mcpManager.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, cleaning up...');
    await mcpManager.cleanup();
    process.exit(0);
  });

  try {
    // Start all available MCP servers
    await mcpManager.startServers(availableServers);

    // Get all available tools from all servers
    const allTools = mcpManager.getAllTools();
    
    if (allTools.length === 0) {
      console.error('❌ No MCP tools available. Check your server configurations.');
      process.exit(1);
    }

    console.log(`\n🔧 Total available tools: ${allTools.length}`);
    allTools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description || 'No description'}`);
    });

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    // Create the prompt
    const prompt = `You have access to multiple MCP tools for various operations:

Available tools:
${allTools.map(tool => `- ${tool.name}: ${tool.description || 'No description'}`).join('\n')}

Please help me with the following task:
1. Query the Supabase "parts" table to get all DXF URLs where dxf_url is not null
2. Then use the nesting tools to nest those DXF parts on a 1000x500mm sheet with 2mm spacing
3. Show me the results including utilization and any parts that couldn't fit

Use the appropriate tools to accomplish this workflow.`;

    // Start conversation
    console.log('\n🤖 Starting conversation with Claude...\n');
    const messages: Anthropic.MessageParam[] = [{
      role: 'user',
      content: prompt,
    }];

    // Convert MCP tools to Anthropic tool format
    const anthropicTools = allTools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema as any,
    }));

    let conversationComplete = false;
    let iterations = 0;
    const maxIterations = 10;

    while (!conversationComplete && iterations < maxIterations) {
      iterations++;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🤖 Claude thinking (iteration ${iterations})...`);

      // Get Claude's response
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        messages: messages,
        max_tokens: 4096,
        tools: anthropicTools,
        temperature: 0,
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
        
        console.log('\n📝 Claude\'s final response:');
        console.log(textBlocks);
      } else {
        // Execute tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUses) {
          console.log(`\n🔨 Claude wants to use tool: ${toolUse.name}`);
          console.log(`   Arguments:`, JSON.stringify(toolUse.input, null, 2));

          try {
            // Execute tool via MCP manager
            const result = await mcpManager.executeToolCall(
              toolUse.name, 
              toolUse.input as Record<string, unknown>
            );

            console.log('📊 Tool result received:', JSON.stringify(result, null, 2));

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result.content),
            });

            console.log('✅ Tool executed successfully');
          } catch (error) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: String(error) }),
              is_error: true,
            });
            console.log('❌ Tool execution failed:', error);
          }
        }

        // Add tool results to conversation
        messages.push({
          role: 'user',
          content: toolResults,
        });
      }
    }

    if (iterations >= maxIterations) {
      console.log('\n⚠️ Reached maximum iterations limit');
    }

  } catch (error) {
    console.error('❌ Error in main execution:', error);
    await mcpManager.cleanup();
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Workflow completed!');

  // Cleanup
  await mcpManager.cleanup();
  process.exit(0);
}

// Run the application
main().catch(async (error) => {
  console.error('❌ Application failed:', error);
  process.exit(1);
});