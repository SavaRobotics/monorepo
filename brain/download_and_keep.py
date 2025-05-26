"""Test download without cleanup so you can see the file."""

import asyncio
import os
from brain.llm.client import get_llm_client
from brain.llm.tool_calling_v2 import EnhancedBrainOrchestrator
from mcp_servers.supabase.server import query_table
from mcp_servers.web.server import download_file


async def download_step_file():
    """Download STEP file and keep it."""
    
    # Set up API keys
    os.environ["ANTHROPIC_API_KEY"] = "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"
    os.environ["SUPABASE_URL"] = "https://pynaxyfwywlqfvtjbtuc.supabase.co"
    os.environ["SUPABASE_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg"
    
    # Create LLM client and brain
    llm_client = get_llm_client("anthropic")
    brain = EnhancedBrainOrchestrator(llm_client)
    
    # Register tools
    brain.register_tool(
        "query_table",
        {
            "name": "query_table",
            "description": "Query a Supabase table to retrieve data",
            "input_schema": {
                "type": "object",
                "properties": {
                    "table_name": {"type": "string", "description": "Name of the table to query"},
                    "filters": {"type": "object", "description": "Optional filters to apply"}
                },
                "required": ["table_name"]
            }
        },
        query_table
    )
    
    brain.register_tool(
        "download_file",
        {
            "name": "download_file",
            "description": "Download a file from a URL to local storage",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to download from"},
                    "local_path": {"type": "string", "description": "Local path to save the file"}
                },
                "required": ["url", "local_path"]
            }
        },
        download_file
    )
    
    print("🤖 Using LLM to download STEP file...")
    
    response = await brain.process_message(
        "Query the parts table for ID 3 and download its STEP file as 'downloaded_by_llm.step'"
    )
    
    print(f"\n📝 LLM Response: {response}")
    
    # Check result
    if os.path.exists("downloaded_by_llm.step"):
        size = os.path.getsize("downloaded_by_llm.step")
        print(f"\n✅ File exists! Size: {size} bytes")
        print("📍 Location: ./downloaded_by_llm.step")
    else:
        print("\n❌ File not found!")


if __name__ == "__main__":
    asyncio.run(download_step_file())