#!/usr/bin/env python3
"""Simple MCP server for DXF part nesting functionality without fastmcp."""

import os
import sys
import json
import asyncio
import tempfile
from pathlib import Path
from typing import Dict, List, Any
import httpx
from datetime import datetime

# Add current directory to Python path for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Import the nesting functionality
from nest import DXFNester

async def handle_mcp_request(request: Dict[str, Any]) -> Dict[str, Any]:
    """Handle MCP protocol requests."""
    method = request.get("method")
    params = request.get("params", {})
    
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "nesting",
                    "version": "1.0.0"
                }
            }
        }
    
    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "tools": [
                    {
                        "name": "nest_parts",
                        "description": "Nest DXF parts on a sheet. Accepts a list of DXF URLs and arranges them efficiently.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "dxf_urls": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "List of URLs to DXF files. Duplicate URLs represent multiple quantities."
                                },
                                "sheet_width": {
                                    "type": "number",
                                    "description": "Width of the sheet in mm (default: 1000)",
                                    "default": 1000.0
                                },
                                "sheet_height": {
                                    "type": "number", 
                                    "description": "Height of the sheet in mm (default: 500)",
                                    "default": 500.0
                                },
                                "spacing": {
                                    "type": "number",
                                    "description": "Minimum spacing between parts in mm (default: 2)",
                                    "default": 2.0
                                }
                            },
                            "required": ["dxf_urls"]
                        }
                    },
                    {
                        "name": "get_nesting_status",
                        "description": "Get the current status of the nesting service",
                        "inputSchema": {
                            "type": "object",
                            "properties": {}
                        }
                    }
                ]
            }
        }
    
    elif method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        
        if tool_name == "nest_parts":
            result = await nest_parts(**arguments)
        elif tool_name == "get_nesting_status":
            result = await get_nesting_status(**arguments)
        else:
            result = {"error": f"Unknown tool: {tool_name}"}
        
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(result)
                    }
                ]
            }
        }
    
    else:
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "error": {
                "code": -32601,
                "message": f"Method not found: {method}"
            }
        }

# Global state for tracking nesting operations
nesting_status = {
    "is_running": False,
    "message": "Ready"
}

async def nest_parts(
    dxf_urls: List[str],
    sheet_width: float = 1000.0,
    sheet_height: float = 500.0,
    spacing: float = 2.0
) -> Dict:
    """Nest DXF parts on a sheet."""
    global nesting_status
    
    if nesting_status["is_running"]:
        return {
            "error": "Nesting operation already in progress",
            "message": nesting_status["message"]
        }
    
    nesting_status["is_running"] = True
    nesting_status["message"] = "Starting nesting operation..."
    
    try:
        # Create temporary directory for DXF files
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download all DXF files
            downloaded_files = []
            url_to_file_map = {}
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                for i, url in enumerate(dxf_urls):
                    nesting_status["message"] = f"Downloading file {i+1}/{len(dxf_urls)}..."
                    
                    try:
                        filename = f"part_{i}_{Path(url).name}"
                        if not filename.endswith('.dxf'):
                            filename += '.dxf'
                        
                        filepath = os.path.join(temp_dir, filename)
                        response = await client.get(url)
                        response.raise_for_status()
                        
                        with open(filepath, 'wb') as f:
                            f.write(response.content)
                        
                        downloaded_files.append(filepath)
                        url_to_file_map[filepath] = url
                        
                    except Exception as e:
                        print(f"Error downloading {url}: {e}", file=sys.stderr)
                        continue
            
            if not downloaded_files:
                return {
                    "error": "No DXF files could be downloaded",
                    "utilization_percent": 0.0,
                    "placed_count": 0,
                    "total_parts": len(dxf_urls),
                    "message": "Failed to download any DXF files"
                }
            
            # Perform nesting
            nesting_status["message"] = "Running nesting algorithm..."
            nester = DXFNester(sheet_width, sheet_height, spacing)
            
            # Set output directory environment variable
            output_dir = os.environ.get('OUTPUT_DIR', tempfile.mkdtemp())
            os.environ['OUTPUT_DIR'] = output_dir
            os.environ['OUTPUT_NAME'] = 'nested_layout'
            
            # Create output directory if it doesn't exist
            os.makedirs(output_dir, exist_ok=True)
            
            # Run nesting
            result = nester.nest_parts(downloaded_files)
            
            # Map unfittable files back to URLs
            unfittable_urls = []
            for filepath in result.get('unfittable_parts', []):
                if filepath in url_to_file_map:
                    unfittable_urls.append(url_to_file_map[filepath])
            
            # Prepare response
            response = {
                "utilization_percent": result['utilization'],
                "placed_count": result.get('placed_count', 0),
                "total_parts": len(dxf_urls),
                "unfittable_urls": unfittable_urls,
                "nested_dxf_path": result.get('nested_dxf'),
                "message": result['message']
            }
            
            return response
            
    except Exception as e:
        return {
            "error": f"Nesting operation failed: {str(e)}",
            "utilization_percent": 0.0,
            "placed_count": 0,
            "total_parts": len(dxf_urls),
            "message": f"Error: {str(e)}"
        }
    
    finally:
        nesting_status["is_running"] = False
        nesting_status["message"] = "Ready"

async def get_nesting_status() -> Dict:
    """Check if a nesting operation is currently running."""
    return nesting_status

async def main():
    """Main MCP server loop."""
    while True:
        try:
            # Read JSON-RPC request from stdin
            line = sys.stdin.readline()
            if not line:
                break
                
            request = json.loads(line.strip())
            response = await handle_mcp_request(request)
            
            # Write JSON-RPC response to stdout
            print(json.dumps(response), flush=True)
            
        except json.JSONDecodeError:
            # Invalid JSON, ignore
            continue
        except Exception as e:
            # Send error response
            error_response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32603,
                    "message": f"Internal error: {str(e)}"
                }
            }
            print(json.dumps(error_response), flush=True)

if __name__ == "__main__":
    asyncio.run(main())