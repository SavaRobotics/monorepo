"""Filesystem operations MCP server."""

import os
import json
from pathlib import Path
from typing import Any, Dict, List
import aiofiles
from fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("Filesystem")


@mcp.tool()
async def read_file(file_path: str) -> str:
    """Read contents of a file.
    
    Args:
        file_path: Path to the file to read
        
    Returns:
        File contents as string
    """
    try:
        async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
            content = await f.read()
        return content
    except Exception as e:
        return f"Error reading file: {str(e)}"


@mcp.tool()
async def write_file(file_path: str, content: str) -> str:
    """Write content to a file.
    
    Args:
        file_path: Path to the file to write
        content: Content to write to the file
        
    Returns:
        Success message or error
    """
    try:
        # Create directory if it doesn't exist
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
            await f.write(content)
        return f"Successfully wrote to {file_path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"


@mcp.tool()
async def list_directory(directory_path: str = ".") -> List[Dict[str, Any]]:
    """List contents of a directory.
    
    Args:
        directory_path: Path to the directory to list (defaults to current directory)
        
    Returns:
        List of files and directories with metadata
    """
    try:
        path = Path(directory_path)
        if not path.exists():
            return [{"error": f"Directory {directory_path} does not exist"}]
            
        items = []
        for item in path.iterdir():
            try:
                stat = item.stat()
                items.append({
                    "name": item.name,
                    "path": str(item),
                    "type": "directory" if item.is_dir() else "file",
                    "size": stat.st_size if item.is_file() else None,
                    "modified": stat.st_mtime
                })
            except (OSError, PermissionError):
                items.append({
                    "name": item.name,
                    "path": str(item),
                    "type": "unknown",
                    "error": "Permission denied or file not accessible"
                })
        
        return sorted(items, key=lambda x: (x["type"] != "directory", x["name"]))
    except Exception as e:
        return [{"error": f"Error listing directory: {str(e)}"}]


@mcp.tool()
async def create_directory(directory_path: str) -> str:
    """Create a new directory.
    
    Args:
        directory_path: Path to the directory to create
        
    Returns:
        Success message or error
    """
    try:
        Path(directory_path).mkdir(parents=True, exist_ok=True)
        return f"Successfully created directory {directory_path}"
    except Exception as e:
        return f"Error creating directory: {str(e)}"


@mcp.tool()
async def delete_file(file_path: str) -> str:
    """Delete a file.
    
    Args:
        file_path: Path to the file to delete
        
    Returns:
        Success message or error
    """
    try:
        path = Path(file_path)
        if not path.exists():
            return f"File {file_path} does not exist"
            
        if path.is_file():
            path.unlink()
            return f"Successfully deleted file {file_path}"
        else:
            return f"Path {file_path} is not a file"
    except Exception as e:
        return f"Error deleting file: {str(e)}"


if __name__ == "__main__":
    mcp.run()