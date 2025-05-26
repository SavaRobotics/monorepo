import asyncio
import os
import json
from typing import Optional
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from anthropic import Anthropic
from contextlib import AsyncExitStack

class MCPClient:
    def __init__(self):
        load_dotenv()
        self.anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.exit_stack = AsyncExitStack()
        self.sessions = {}

    async def connect_to_server(self, server_script_path: str):
        """Connect to an MCP server"""
        is_python = server_script_path.endswith('.py')
        is_ts = server_script_path.endswith('.ts')
        is_js = server_script_path.endswith('.js')
        
        if is_python:
            server_params = StdioServerParameters(
                command="python", args=[server_script_path]
            )
        elif is_ts:
            server_params = StdioServerParameters(
                command="npx", args=["tsx", server_script_path]
            )
        elif is_js:
            server_params = StdioServerParameters(
                command="node", args=[server_script_path]
            )
        else:
            # For npx packages like @supabase/mcp
            server_params = StdioServerParameters(
                command="npx", args=["-y", server_script_path]
            )
        
        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        stdio, write = stdio_transport
        session = await self.exit_stack.enter_async_context(
            ClientSession(stdio, write)
        )
        
        await session.initialize()
        
        # List available tools
        response = await session.list_tools()
        tools = response.tools
        print(f"\nConnected to server '{server_script_path}' with {len(tools)} tools available")
        
        return session, tools

    async def process_query(self, query: str, session: ClientSession, tools: list) -> str:
        """Process a query using Claude and available tools"""
        messages = [
            {
                "role": "user", 
                "content": query
            }
        ]
        
        # Prepare tools for Claude
        available_tools = [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema
            }
            for tool in tools
        ]
        
        # Initial Claude API call
        response = self.anthropic.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=messages,
            tools=available_tools
        )
        
        # Process response and handle tool calls
        final_response = []
        for content in response.content:
            if content.type == 'text':
                final_response.append(content.text)
            elif content.type == 'tool_use':
                # Execute tool call
                tool_name = content.name
                tool_args = content.input
                
                # Call the tool via MCP
                result = await session.call_tool(tool_name, tool_args)
                
                # Add tool result to messages for follow-up
                messages.append({
                    "role": "assistant",
                    "content": response.content
                })
                messages.append({
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": content.id,
                            "content": json.dumps(result.content)
                        }
                    ]
                })
                
                # Get Claude's interpretation of the tool result
                follow_up = self.anthropic.messages.create(
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=1024,
                    messages=messages,
                    tools=available_tools
                )
                
                for follow_up_content in follow_up.content:
                    if follow_up_content.type == 'text':
                        final_response.append(follow_up_content.text)
        
        return '\n'.join(final_response)

    async def chat_loop(self, session: ClientSession, tools: list):
        """Run an interactive chat loop"""
        print("\nMCP Client Started!")
        print("Type your queries or 'quit' to exit.\n")
        
        while True:
            try:
                query = input("You: ").strip()
                
                if query.lower() == 'quit':
                    break
                
                response = await self.process_query(query, session, tools)
                print(f"\nClaude: {response}\n")
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Error: {e}")

    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()

async def main():
    """Main entry point - connects to Supabase MCP server"""
    # Check for required environment variables
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY not found in environment")
        return
    
    if not os.getenv("SUPABASE_PAT"):
        print("Error: SUPABASE_PAT (Personal Access Token) not found in environment")
        return
    
    client = MCPClient()
    
    try:
        # Connect to Supabase MCP server
        # Using the npx package name as specified in the Supabase blog
        session, tools = await client.connect_to_server("@supabase/mcp")
        
        # Run the chat loop with the initial query
        print("\nInitial query: Reading from 'parts' table...")
        response = await client.process_query(
            "Can you read from my 'parts' table and tell me what data is in there? Show me a summary of the table structure and some sample data.",
            session,
            tools
        )
        print(f"\nClaude: {response}\n")
        
        # Continue with interactive chat
        await client.chat_loop(session, tools)
        
    except Exception as e:
        print(f"Failed to connect to server: {e}")
    finally:
        await client.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
