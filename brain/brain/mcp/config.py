"""MCP server configuration."""

import os
from typing import Dict, List, Optional


class MCPServerConfig:
    """Configuration for MCP servers."""
    
    # Default server configurations
    DEFAULT_SERVERS = {
        "filesystem": {
            "command": ["python", "-m", "mcp_servers.filesystem.server"],
            "description": "File system operations like read, write, list directories"
        },
        "web": {
            "command": ["python", "-m", "mcp_servers.web.server"],
            "description": "Web operations like HTTP requests, downloads"
        },
        "database": {
            "command": ["python", "-m", "mcp_servers.database.server"],
            "description": "Database operations with SQLite"
        },
        "supabase": {
            "command": ["python", "-m", "mcp_servers.supabase.server"],
            "description": "Supabase database operations"
        }
    }
    
    @classmethod
    def get_server_config(cls, server_name: str) -> Optional[Dict]:
        """Get configuration for a specific server.
        
        Args:
            server_name: Name of the server
            
        Returns:
            Server configuration or None if not found
        """
        return cls.DEFAULT_SERVERS.get(server_name)
    
    @classmethod
    def get_all_servers(cls) -> Dict[str, Dict]:
        """Get all available server configurations.
        
        Returns:
            Dictionary of all server configurations
        """
        return cls.DEFAULT_SERVERS.copy()
    
    @classmethod
    def get_enabled_servers(cls) -> List[str]:
        """Get list of enabled servers based on environment variables.
        
        Returns:
            List of enabled server names
        """
        # Check for specific environment variable overrides
        enabled = os.getenv("MCP_ENABLED_SERVERS", "").split(",")
        enabled = [name.strip() for name in enabled if name.strip()]
        
        # If no specific servers are configured, enable all by default
        if not enabled:
            enabled = list(cls.DEFAULT_SERVERS.keys())
        
        # Filter out any servers that don't exist in our configuration
        return [name for name in enabled if name in cls.DEFAULT_SERVERS]
    
    @classmethod
    def is_server_enabled(cls, server_name: str) -> bool:
        """Check if a server is enabled.
        
        Args:
            server_name: Name of the server
            
        Returns:
            True if the server is enabled
        """
        return server_name in cls.get_enabled_servers()


def create_server_command(server_name: str, working_dir: str = "/app") -> List[str]:
    """Create the command to start a server.
    
    Args:
        server_name: Name of the server
        working_dir: Working directory for the command
        
    Returns:
        Command list to start the server
    """
    config = MCPServerConfig.get_server_config(server_name)
    if not config:
        raise ValueError(f"Unknown server: {server_name}")
    
    command = config["command"].copy()
    
    # Set Python path to include the working directory
    env_vars = {
        "PYTHONPATH": working_dir
    }
    
    return command, env_vars