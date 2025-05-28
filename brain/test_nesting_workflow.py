#!/usr/bin/env python3
"""Test multi-step workflow: Query Supabase for DXF URLs, then nest them."""

import asyncio
import os
from dotenv import load_dotenv
import sys

# Load environment variables
load_dotenv()

# Add the brain directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from brain.llm.client import AnthropicClient
from brain.llm.tool_calling_v2 import EnhancedBrainOrchestrator
from brain.mcp.client import MCPClient
from brain.mcp.config import MCPConfig

# Specialized prompt for the nesting coordinator
NESTING_COORDINATOR_PROMPT = """You are a nesting coordinator with access to two MCP servers:
1. Supabase MCP - for querying the parts database
2. Nesting MCP - for arranging DXF parts on sheets

Your task is to coordinate a multi-step workflow:
1. First, query the parts table to get all dxf_url values where dxf_url is not null
2. Count how many times each URL appears (this represents quantity)
3. Create a list with duplicate URLs for quantities (if a URL appears 3 times, include it 3 times in your list)
4. Call the nesting service with this list
5. Report the results including:
   - Utilization percentage
   - Number of parts successfully placed vs total
   - Any parts that couldn't fit (with their URLs)
   - Path to the nested DXF file

Begin by querying the parts table for all records with non-null dxf_url values."""

async def test_nesting_workflow():
    """Test the multi-step nesting workflow."""
    print("🚀 Starting multi-step nesting workflow test...\n")
    
    # Initialize the LLM client
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ Error: ANTHROPIC_API_KEY not found in environment")
        return
    
    llm_client = AnthropicClient(api_key=api_key)
    orchestrator = EnhancedBrainOrchestrator(llm_client)
    
    # Initialize MCP clients
    mcp_configs = [
        # Supabase MCP
        MCPConfig(
            name="supabase",
            command="python3",
            args=["-m", "mcp_servers.supabase.server"],
            env={
                "SUPABASE_URL": os.getenv("SUPABASE_URL", ""),
                "SUPABASE_KEY": os.getenv("SUPABASE_KEY", "")
            }
        ),
        # Nesting MCP
        MCPConfig(
            name="nesting",
            command="python3",
            args=["-m", "mcp_servers.nesting.server"],
            env={}
        )
    ]
    
    mcp_clients = []
    
    try:
        # Connect to all MCP servers
        print("📡 Connecting to MCP servers...")
        for config in mcp_configs:
            client = MCPClient(config)
            await client.connect()
            mcp_clients.append(client)
            print(f"✅ Connected to {config.name} MCP server")
        
        print()
        
        # Register all tools with the orchestrator
        for client in mcp_clients:
            tools = await client.list_tools()
            print(f"📦 Registering {len(tools)} tools from {client.config.name}:")
            
            for tool in tools:
                print(f"  - {tool['name']}")
                
                # Create async wrapper for the MCP tool
                async def make_handler(client_ref, tool_name):
                    async def handler(**kwargs):
                        return await client_ref.call_tool(tool_name, kwargs)
                    return handler
                
                handler = await make_handler(client, tool['name'])
                orchestrator.register_tool(tool['name'], tool, handler)
        
        print("\n" + "="*60 + "\n")
        
        # Clear conversation history and set specialized prompt
        orchestrator.conversation_history = []
        
        # Execute the multi-step workflow
        print("🤖 Starting nesting coordinator workflow...\n")
        response = await orchestrator.process_message(NESTING_COORDINATOR_PROMPT)
        
        print("\n" + "="*60 + "\n")
        print("📊 Final Report:")
        print(response)
        
    except Exception as e:
        print(f"❌ Error during workflow: {str(e)}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Disconnect from all MCP servers
        print("\n🔌 Disconnecting from MCP servers...")
        for client in mcp_clients:
            await client.disconnect()
        print("✅ All connections closed")

if __name__ == "__main__":
    asyncio.run(test_nesting_workflow())