import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamTransport } from '@supabase/mcp-utils';
import { createPostgrestMcpServer } from '@supabase/mcp-server-postgrest';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './.env' });

async function main() {
  console.log('🚀 Starting LLM test with Supabase MCP server...\n');

  // Check for required environment variables
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!anthropicApiKey || !supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables');
    console.error('   Required: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY');
    process.exit(1);
  }

  // Create stream transports for MCP communication
  const clientTransport = new StreamTransport();
  const serverTransport = new StreamTransport();

  // Connect the streams together
  clientTransport.readable.pipeTo(serverTransport.writable);
  serverTransport.readable.pipeTo(clientTransport.writable);

  // Create MCP client
  const mcpClient = new Client(
    {
      name: 'TestLLMClient',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  // Create Supabase MCP server
  const server = createPostgrestMcpServer({
    apiUrl: `${supabaseUrl}/rest/v1`,
    apiKey: supabaseKey,
    schema: 'public',
  });

  // Connect client and server
  console.log('📡 Connecting to MCP server...');
  await server.connect(serverTransport);
  await mcpClient.connect(clientTransport);

  // List available tools
  const tools = await mcpClient.listTools();
  console.log('🔧 Available tools:', tools.tools.map(t => t.name).join(', '));
  console.log('');

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: anthropicApiKey,
  });

  // Create the prompt
  const prompt = `You have access to a Supabase MCP tool for database queries. 

Please use the postgrestRequest tool to query the "parts" table and get all items from the "dxf_url" column where the values are not null.

The tool expects:
- method: "GET" 
- path: Should be the table name with any filters
- body: Not needed for GET requests

After getting the results, please:
1. Tell me how many DXF URLs you found
2. Show me 1-2 example URLs from the results
3. Explain what the query did`;

  // Create conversation with Claude
  console.log('🤖 Sending prompt to Claude...\n');
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: prompt,
  }];

  // Convert MCP tools to Anthropic tool format
  const anthropicTools = tools.tools.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: tool.inputSchema as any,
  }));

  let conversationComplete = false;
  let iterations = 0;
  const maxIterations = 5;

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
          // Call the MCP tool
          const result = await mcpClient.callTool({
            name: toolUse.name,
            arguments: toolUse.input as Record<string, unknown>,
          });

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

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Test completed!');

  // Cleanup
  await mcpClient.close();
  process.exit(0);
}

// Run the test
main().catch(console.error);