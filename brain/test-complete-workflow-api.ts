import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './.env' });

async function streamWorkflow(prompt: string) {
  const response = await fetch('http://localhost:3000/api/workflow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      stream: true,
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0,
      maxTokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const iteration = JSON.parse(line);
          console.log('\n' + '='.repeat(60));
          console.log(`🤖 Iteration ${iteration.iterationNumber}:`);
          
          if (iteration.toolCalls) {
            for (const toolCall of iteration.toolCalls) {
              console.log(`\n🔨 Tool: ${toolCall.name}`);
              console.log(`   Status: ${toolCall.status}`);
              if (toolCall.result) {
                console.log(`   Result:`, JSON.stringify(toolCall.result, null, 2));
              }
              if (toolCall.error) {
                console.log(`   Error:`, toolCall.error);
              }
            }
          }
          
          if (iteration.claudeResponse) {
            console.log('\n📝 Claude says:');
            console.log(iteration.claudeResponse);
          }
          
          if (iteration.error) {
            console.error('❌ Error:', iteration.error);
          }
        } catch (e) {
          console.error('Failed to parse line:', line);
        }
      }
    }
  }
}

async function main() {
  console.log('🚀 Starting Complete Workflow Test via API...\n');
  console.log('⚠️  Make sure the brain Docker container is running on port 3000!');
  console.log('   Run: docker-compose up -d\n');

  const prompt = `You have access to multiple MCP tools for various operations.

Please help me with the following integrated workflow:

1. First, use the unfold_step_file tool to convert the STEP file from URL: https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles/test.step
   - Use K-factor 0.38 for the conversion
   
2. Once the DXF is generated successfully, use the upload_to_supabase_storage tool to upload it to the "dxffiles" bucket
   
3. After uploading the unfolded DXF, query the Supabase "parts" table to get all DXF URLs where dxf_url is not null
   
4. Then use the nesting tools to nest ALL the DXF parts (including the newly uploaded one) on a 1000x500mm sheet with 2mm spacing
   
5. Generate G-code for the nested parts using the gcode tools
   
6. Show me the complete results including:
   - The public URL of the uploaded unfolded DXF
   - The nesting results with utilization percentage
   - The G-code generation status
   - Any parts that couldn't fit on the sheet

Use the appropriate tools to accomplish this integrated workflow.`;

  try {
    await streamWorkflow(prompt);
    console.log('\n✅ Workflow completed!');
  } catch (error) {
    console.error('❌ Workflow failed:', error);
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  console.error('❌ Application failed:', error);
  process.exit(1);
});