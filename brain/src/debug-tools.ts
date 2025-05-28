import * as dotenv from 'dotenv';
import { MCPServerManager } from './mcp/manager.js';
import { availableServers } from './mcp/servers/index.js';

// Load environment variables
dotenv.config({ path: './.env' });

async function debugTools() {
  console.log('🔍 Debugging MCP tools...\n');

  const mcpManager = new MCPServerManager();

  try {
    // Start servers
    await mcpManager.startServers(availableServers);

    // Test nesting tool directly
    console.log('\n🧪 Testing nesting_get_nesting_status...');
    const statusResult = await mcpManager.executeToolCall('nesting_get_nesting_status', {});
    console.log('Status result:', JSON.stringify(statusResult, null, 2));

    // Test a simple nest_parts call with fake URLs
    console.log('\n🧪 Testing nesting_nest_parts with fake URLs...');
    const nestResult = await mcpManager.executeToolCall('nesting_nest_parts', {
      dxf_urls: ['https://example.com/fake.dxf'],
      sheet_width: 100,
      sheet_height: 100,
      spacing: 1
    });
    console.log('Nest result:', JSON.stringify(nestResult, null, 2));

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mcpManager.cleanup();
  }
}

debugTools().catch(console.error);