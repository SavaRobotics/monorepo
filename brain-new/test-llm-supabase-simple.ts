import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: './.env' });

interface MCPTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

async function main() {
  console.log('🚀 Starting LLM test with Supabase MCP simulation...\n');

  // Check for required environment variables
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!anthropicApiKey || !supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables');
    console.error('   Required: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY');
    process.exit(1);
  }

  // Initialize clients
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Define the MCP tool for PostgREST
  const mcpTools: MCPTool[] = [
    {
      name: 'postgrestRequest',
      description: 'Performs an HTTP request to PostgREST server to query the Supabase database',
      input_schema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PATCH', 'DELETE'],
            description: 'The HTTP method to use'
          },
          path: {
            type: 'string',
            description: 'The path to query (e.g., /parts?dxf_url=not.is.null)'
          },
          body: {
            type: 'object',
            description: 'The request body (for POST and PATCH requests)'
          }
        },
        required: ['method', 'path']
      }
    }
  ];

  // Execute PostgREST request
  async function executePostgrestRequest(method: string, path: string, body?: any) {
    console.log(`\n🔧 Executing PostgREST request:`);
    console.log(`   Method: ${method}`);
    console.log(`   Path: ${path}`);
    if (body) console.log(`   Body: ${JSON.stringify(body, null, 2)}`);

    try {
      // Parse the path to extract table and filters
      const pathParts = path.split('?');
      const tableName = pathParts[0].replace('/', '');
      const queryString = pathParts[1] || '';

      if (method === 'GET') {
        let query = supabase.from(tableName).select('*');

        // Parse simple query parameters
        if (queryString) {
          const params = new URLSearchParams(queryString);
          
          // Handle common PostgREST operators
          for (const [key, value] of params.entries()) {
            if (value.startsWith('not.is.')) {
              const checkValue = value.replace('not.is.', '');
              if (checkValue === 'null') {
                query = query.not(key, 'is', null);
              }
            } else if (value.startsWith('eq.')) {
              query = query.eq(key, value.replace('eq.', ''));
            } else if (value.startsWith('neq.')) {
              query = query.neq(key, value.replace('neq.', ''));
            }
            // Add more operators as needed
          }
        }

        const { data, error } = await query;
        
        if (error) {
          return { error: error.message };
        }

        return {
          success: true,
          data: data || [],
          count: data?.length || 0
        };
      }

      return { error: `Method ${method} not implemented in this simulation` };
    } catch (error) {
      return { error: String(error) };
    }
  }

  // Create the prompt
  const prompt = `You have access to a PostgREST MCP tool for querying the Supabase database.

Please use the postgrestRequest tool to query the "parts" table and get all items from the "dxf_url" column where the values are not null.

For PostgREST, you should:
- Use method: "GET"
- Use path: "/parts?dxf_url=not.is.null" to filter out null values
- No body is needed for GET requests

After getting the results, please:
1. Tell me how many DXF URLs you found
2. Show me 1-2 example URLs from the results
3. Explain what the query did`;

  console.log('🤖 Sending prompt to Claude...\n');

  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: prompt,
  }];

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
      tools: mcpTools as any,
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
          let result: any;
          
          if (toolUse.name === 'postgrestRequest') {
            const { method, path, body } = toolUse.input as any;
            result = await executePostgrestRequest(method, path, body);
          } else {
            result = { error: `Unknown tool: ${toolUse.name}` };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });

          console.log('✅ Tool executed successfully');
          if (result.data && Array.isArray(result.data)) {
            console.log(`   Found ${result.data.length} records`);
          }
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
  process.exit(0);
}

// Run the test
main().catch(console.error);