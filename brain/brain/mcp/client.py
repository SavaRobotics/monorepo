"""MCP client for connecting to and managing MCP servers."""

import asyncio
import json
from typing import Any, Dict, List, Optional
import structlog
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

logger = structlog.get_logger()


class MCPClientManager:
    """Manages connections to multiple MCP servers."""
    
    def __init__(self):
        self.servers: Dict[str, ClientSession] = {}
        self.server_configs: Dict[str, Dict] = {}
    
    async def add_server(self, name: str, command: List[str], args: Optional[List[str]] = None, env: Optional[Dict[str, str]] = None):
        """Add and connect to an MCP server.
        
        Args:
            name: Server identifier
            command: Command to start the server
            args: Optional command arguments
            env: Optional environment variables
        """
        try:
            server_params = StdioServerParameters(
                command=command[0],
                args=command[1:] + (args or []),
                env=env
            )
            
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    # Initialize the connection
                    await session.initialize()
                    
                    # Store the session
                    self.servers[name] = session
                    self.server_configs[name] = {
                        "command": command,
                        "args": args,
                        "env": env
                    }
                    
                    logger.info("Connected to MCP server", server=name)
                    
        except Exception as e:
            logger.error("Failed to connect to MCP server", server=name, error=str(e))
            raise
    
    async def list_tools(self, server_name: Optional[str] = None) -> Dict[str, List[Dict]]:
        """List available tools from servers.
        
        Args:
            server_name: Optional server name to list tools from. If None, lists from all servers.
            
        Returns:
            Dictionary mapping server names to their available tools
        """
        tools = {}
        
        servers_to_check = [server_name] if server_name else list(self.servers.keys())
        
        for name in servers_to_check:
            if name not in self.servers:
                continue
                
            try:
                session = self.servers[name]
                result = await session.list_tools()
                tools[name] = result.tools
                
            except Exception as e:
                logger.error("Failed to list tools", server=name, error=str(e))
                tools[name] = []
        
        return tools
    
    async def call_tool(self, server_name: str, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call a tool on a specific server.
        
        Args:
            server_name: Name of the server
            tool_name: Name of the tool to call
            arguments: Arguments to pass to the tool
            
        Returns:
            Tool execution result
        """
        if server_name not in self.servers:
            raise ValueError(f"Server {server_name} not connected")
        
        try:
            session = self.servers[server_name]
            result = await session.call_tool(tool_name, arguments)
            
            logger.info("Tool executed successfully", 
                       server=server_name, 
                       tool=tool_name, 
                       arguments=arguments)
            
            return result.content
            
        except Exception as e:
            logger.error("Tool execution failed", 
                        server=server_name, 
                        tool=tool_name, 
                        error=str(e))
            raise
    
    async def disconnect_server(self, server_name: str):
        """Disconnect from a server.
        
        Args:
            server_name: Name of the server to disconnect
        """
        if server_name in self.servers:
            try:
                # Close the session
                session = self.servers[server_name]
                # Note: Actual cleanup depends on MCP implementation
                del self.servers[server_name]
                del self.server_configs[server_name]
                
                logger.info("Disconnected from MCP server", server=server_name)
                
            except Exception as e:
                logger.error("Error disconnecting from server", server=server_name, error=str(e))
    
    async def disconnect_all(self):
        """Disconnect from all servers."""
        for server_name in list(self.servers.keys()):
            await self.disconnect_server(server_name)
    
    def get_connected_servers(self) -> List[str]:
        """Get list of connected server names."""
        return list(self.servers.keys())
    
    async def get_server_info(self, server_name: str) -> Optional[Dict]:
        """Get information about a server.
        
        Args:
            server_name: Name of the server
            
        Returns:
            Server information or None if not connected
        """
        if server_name not in self.servers:
            return None
        
        try:
            session = self.servers[server_name]
            # Get server capabilities and tools
            tools_result = await session.list_tools()
            
            return {
                "name": server_name,
                "config": self.server_configs.get(server_name, {}),
                "tools": [tool.name for tool in tools_result.tools],
                "tool_count": len(tools_result.tools)
            }
            
        except Exception as e:
            logger.error("Failed to get server info", server=server_name, error=str(e))
            return {
                "name": server_name,
                "config": self.server_configs.get(server_name, {}),
                "error": str(e)
            }