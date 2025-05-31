import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import { MCPServerManager } from './src/mcp/manager.js';
import { availableServers } from './src/mcp/servers/index.js';

// Load environment variables
dotenv.config({ path: './.env' });

// 🔥🔥🔥 OBNOXIOUS TEST SCRIPT 🔥🔥🔥
console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
console.log('🚀 STARTING THE MOST OBNOXIOUS UNFOLDER WORKFLOW TEST SCRIPT EVER 🚀');
console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');

const STEP_FILE_URL = 'https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles/test.step';
const K_FACTOR = 0.38;
const TARGET_BUCKET = 'dxffiles';

async function OBNOXIOUS_UNFOLDER_WORKFLOW_TEST() {
  console.log('\n💥💥💥 INITIALIZING THE MOST EPIC WORKFLOW TEST 💥💥💥');
  console.log(`📁 STEP FILE URL: ${STEP_FILE_URL}`);
  console.log(`⚙️  K-FACTOR: ${K_FACTOR}`);
  console.log(`🪣 TARGET BUCKET: ${TARGET_BUCKET}`);

  // Check for required environment variables
  console.log('\n🔍 CHECKING ENVIRONMENT VARIABLES...');
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!anthropicApiKey) {
    console.error('❌💀 MISSING ANTHROPIC_API_KEY - THIS IS A DISASTER! 💀❌');
    process.exit(1);
  }
  console.log('✅ ANTHROPIC_API_KEY found');

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌💀 MISSING SUPABASE CREDENTIALS - WORKFLOW DOOMED! 💀❌');
    process.exit(1);
  }
  console.log('✅ SUPABASE credentials found');

  // Initialize MCP manager
  console.log('\n🚀 INITIALIZING MCP MANAGER...');
  const mcpManager = new MCPServerManager();

  // Setup cleanup on exit
  process.on('SIGINT', async () => {
    console.log('\n🛑💥 RECEIVED SIGINT - EMERGENCY CLEANUP MODE! 💥🛑');
    await mcpManager.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑💥 RECEIVED SIGTERM - EMERGENCY CLEANUP MODE! 💥🛑');
    await mcpManager.cleanup();
    process.exit(0);
  });

  try {
    console.log('\n🔥 STARTING ALL MCP SERVERS...');
    await mcpManager.startServers(availableServers);

    // Get all available tools
    const allTools = mcpManager.getAllTools();
    
    if (allTools.length === 0) {
      console.error('❌💀 NO MCP TOOLS AVAILABLE - TOTAL SYSTEM FAILURE! 💀❌');
      process.exit(1);
    }

    console.log(`\n🔧💪 LOADED ${allTools.length} POWERFUL TOOLS:`);
    allTools.forEach(tool => {
      console.log(`   🛠️  ${tool.name}: ${tool.description || 'SECRET TOOL'}`);
    });

    // STEP 1: UNFOLD THE STEP FILE 🔥
    console.log('\n' + '='.repeat(80));
    console.log('🥇 STEP 1: UNFOLDING THE LEGENDARY STEP FILE');
    console.log('='.repeat(80));
    
    console.log('📞 CALLING unfold_step_file tool...');
    const unfoldResult = await mcpManager.executeToolCall('unfold_step_file', {
      step_url: STEP_FILE_URL,
      k_factor: K_FACTOR
    });

    console.log('📊 UNFOLD RESULT RECEIVED:');
    console.log(JSON.stringify(unfoldResult, null, 2));

    // Parse the unfold result
    let unfoldData;
    try {
      if (unfoldResult.content && unfoldResult.content[0] && unfoldResult.content[0].text) {
        unfoldData = JSON.parse(unfoldResult.content[0].text);
      } else {
        throw new Error('Invalid unfold result structure');
      }
    } catch (error) {
      console.error('❌💀 FAILED TO PARSE UNFOLD RESULT - CATASTROPHIC FAILURE! 💀❌');
      console.error('Error:', error);
      console.error('Raw result:', unfoldResult);
      await mcpManager.cleanup();
      process.exit(1);
    }

    if (!unfoldData.success) {
      console.error('❌💀 UNFOLD OPERATION FAILED - STEP FILE REJECTED US! 💀❌');
      console.error('Error:', unfoldData.error);
      console.error('Message:', unfoldData.message);
      await mcpManager.cleanup();
      process.exit(1);
    }

    console.log('✅🎉 UNFOLD SUCCESS! DXF FILE CREATED! 🎉✅');
    console.log(`📁 DXF PATH: ${unfoldData.dxf_path}`);
    console.log(`📋 FILENAME: ${unfoldData.filename}`);
    console.log(`⚙️  K-FACTOR USED: ${unfoldData.k_factor}`);

    // STEP 2: UPLOAD DXF TO SUPABASE 🔥
    console.log('\n' + '='.repeat(80));
    console.log('🥈 STEP 2: UPLOADING DXF TO THE ALMIGHTY SUPABASE');
    console.log('='.repeat(80));

    console.log('📞 CALLING upload_to_supabase_storage tool...');
    const uploadResult = await mcpManager.executeToolCall('upload_to_supabase_storage', {
      dxf_path: unfoldData.dxf_path,
      bucket_name: TARGET_BUCKET
    });

    console.log('📊 UPLOAD RESULT RECEIVED:');
    console.log(JSON.stringify(uploadResult, null, 2));

    // Parse the upload result
    let uploadData;
    try {
      if (uploadResult.content && uploadResult.content[0] && uploadResult.content[0].text) {
        uploadData = JSON.parse(uploadResult.content[0].text);
      } else {
        throw new Error('Invalid upload result structure');
      }
    } catch (error) {
      console.error('❌💀 FAILED TO PARSE UPLOAD RESULT - SUPABASE REJECTED US! 💀❌');
      console.error('Error:', error);
      console.error('Raw result:', uploadResult);
      await mcpManager.cleanup();
      process.exit(1);
    }

    if (!uploadData.success) {
      console.error('❌💀 UPLOAD OPERATION FAILED - SUPABASE BETRAYED US! 💀❌');
      console.error('Error:', uploadData.error);
      console.error('Message:', uploadData.message);
      await mcpManager.cleanup();
      process.exit(1);
    }

    console.log('✅🎉 UPLOAD SUCCESS! DXF FILE IS NOW IN THE CLOUD! 🎉✅');
    console.log(`🌐 PUBLIC URL: ${uploadData.public_url}`);
    console.log(`📁 BUCKET PATH: ${uploadData.bucket}/${uploadData.path}`);
    console.log(`📏 FILE SIZE: ${uploadData.file_size} bytes`);

    // FINAL RESULTS 🏆
    console.log('\n' + '🏆'.repeat(40));
    console.log('🏆 WORKFLOW COMPLETED SUCCESSFULLY! 🏆');
    console.log('🏆'.repeat(40));
    
    console.log('\n📋 FINAL RESULTS SUMMARY:');
    console.log(`✅ STEP FILE: ${STEP_FILE_URL}`);
    console.log(`✅ DXF CREATED: ${unfoldData.filename}`);
    console.log(`✅ DXF UPLOADED: ${uploadData.public_url}`);
    console.log(`✅ BUCKET: ${uploadData.bucket}`);
    console.log(`✅ FILE SIZE: ${uploadData.file_size} bytes`);

    console.log('\n🎊🎊🎊 THE OBNOXIOUS TEST SCRIPT HAS TRIUMPHED! 🎊🎊🎊');

  } catch (error) {
    console.error('\n💀💀💀 CATASTROPHIC FAILURE IN MAIN EXECUTION! 💀💀💀');
    console.error('💥 ERROR:', error);
    await mcpManager.cleanup();
    process.exit(1);
  }

  console.log('\n🧹 CLEANING UP THE MESS...');
  await mcpManager.cleanup();
  
  console.log('\n🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
  console.log('🎉 OBNOXIOUS UNFOLDER WORKFLOW TEST SCRIPT COMPLETED! 🎉');
  console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
  
  process.exit(0);
}

// RUN THE OBNOXIOUS TEST
OBNOXIOUS_UNFOLDER_WORKFLOW_TEST().catch(async (error) => {
  console.error('\n💀💀💀 APPLICATION CRASHED AND BURNED! 💀💀💀');
  console.error('💥 CRASH ERROR:', error);
  process.exit(1);
});