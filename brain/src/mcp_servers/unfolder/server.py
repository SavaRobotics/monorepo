#!/usr/bin/env python3
"""Simple MCP server for STEP to DXF unfolding functionality without fastmcp."""

import os
import sys
import json
import asyncio
import tempfile
import subprocess
from pathlib import Path
from typing import Dict, List, Any, Optional
import httpx
from datetime import datetime

# Global state for tracking unfolding operations
unfolder_status = {
    "is_running": False,
    "message": "Ready"
}

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
                    "name": "unfolder",
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
                        "name": "unfold_step_file",
                        "description": "Convert STEP file to DXF for sheet metal fabrication",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "step_url": {
                                    "type": "string",
                                    "description": "URL to the STEP file to unfold"
                                },
                                "k_factor": {
                                    "type": "number",
                                    "description": "K-factor for bend calculations (default: 0.38)",
                                    "default": 0.38
                                }
                            },
                            "required": ["step_url"]
                        }
                    },
                    {
                        "name": "get_unfolder_status",
                        "description": "Get the current status of the unfolder service",
                        "inputSchema": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "name": "upload_unfolded_result",
                        "description": "Upload unfolded DXF result to a URL endpoint",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "dxf_path": {
                                    "type": "string",
                                    "description": "Path to the unfolded DXF file"
                                },
                                "upload_url": {
                                    "type": "string",
                                    "description": "URL to upload the file to"
                                },
                                "method": {
                                    "type": "string",
                                    "description": "HTTP method to use (PUT or POST)",
                                    "default": "PUT"
                                }
                            },
                            "required": ["dxf_path", "upload_url"]
                        }
                    },
                    {
                        "name": "upload_to_supabase_storage",
                        "description": "Upload unfolded DXF file to Supabase storage bucket",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "dxf_path": {
                                    "type": "string",
                                    "description": "Path to the unfolded DXF file"
                                },
                                "bucket_name": {
                                    "type": "string",
                                    "description": "Storage bucket name (default: 'dxffiles')",
                                    "default": "dxffiles"
                                },
                                "folder_path": {
                                    "type": "string",
                                    "description": "Folder path within the bucket (optional)"
                                }
                            },
                            "required": ["dxf_path"]
                        }
                    }
                ]
            }
        }
    
    elif method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        
        if tool_name == "unfold_step_file":
            result = await unfold_step_file(**arguments)
        elif tool_name == "get_unfolder_status":
            result = await get_unfolder_status(**arguments)
        elif tool_name == "upload_unfolded_result":
            result = await upload_unfolded_result(**arguments)
        elif tool_name == "upload_to_supabase_storage":
            result = await upload_to_supabase_storage(**arguments)
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

async def unfold_step_file(
    step_url: str,
    k_factor: float = 0.38
) -> Dict:
    """
    Convert STEP file to DXF for sheet metal fabrication.
    
    Args:
        step_url: URL to the STEP file
        k_factor: K-factor for bend calculations (default: 0.38)
        
    Returns:
        Dictionary containing:
        - success: Boolean indicating if conversion succeeded
        - dxf_path: Path to the generated DXF file
        - message: Status message
        - error: Error message if failed
    """
    global unfolder_status
    
    if unfolder_status["is_running"]:
        return {
            "success": False,
            "error": "Unfolding operation already in progress",
            "message": unfolder_status["message"]
        }
    
    unfolder_status["is_running"] = True
    unfolder_status["message"] = "Starting unfolding operation..."
    
    try:
        # Create temporary directory for files
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download STEP file
            unfolder_status["message"] = "Downloading STEP file..."
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                try:
                    filename = Path(step_url).name
                    if not filename.endswith(('.step', '.stp')):
                        filename = 'input.step'
                    
                    step_path = os.path.join(temp_dir, filename)
                    
                    response = await client.get(step_url)
                    response.raise_for_status()
                    
                    with open(step_path, 'wb') as f:
                        f.write(response.content)
                    
                    print(f"Downloaded STEP file: {filename}", file=sys.stderr)
                    
                except Exception as e:
                    return {
                        "success": False,
                        "error": f"Failed to download STEP file: {str(e)}",
                        "message": "Download failed"
                    }
            
            # Create output directory
            output_dir = os.environ.get('OUTPUT_DIR', '/tmp/unfolder_output')
            os.makedirs(output_dir, exist_ok=True)
            
            # Set environment variables for the unfold script
            env = os.environ.copy()
            env['K_FACTOR'] = str(k_factor)
            env['OUTPUT_DIR'] = output_dir
            
            # Path to the unfold script
            unfold_script = os.path.abspath(os.path.join(
                os.path.dirname(__file__), 
                '..', '..', '..', '..', 'unfolder', 'src', 'unfolder', 'unfold.py'
            ))
            
            if not os.path.exists(unfold_script):
                # Try alternative path
                unfold_script = '/app/src/unfolder/unfold.py'
            
            print(f"Using unfold script: {unfold_script}", file=sys.stderr)
            print(f"Script exists: {os.path.exists(unfold_script)}", file=sys.stderr)
            
            # Run FreeCAD in headless mode
            unfolder_status["message"] = "Running FreeCAD conversion..."
            
            cmd = ['freecad', step_path, '-c', unfold_script]
            
            print(f"Running command: {' '.join(cmd)}", file=sys.stderr)
            
            try:
                result = subprocess.run(
                    cmd,
                    env=env,
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                
                print(f"FreeCAD exit code: {result.returncode}", file=sys.stderr)
                if result.stdout:
                    print(f"FreeCAD stdout: {result.stdout}", file=sys.stderr)
                if result.stderr:
                    print(f"FreeCAD stderr: {result.stderr}", file=sys.stderr)
                
                # Check for output DXF file
                dxf_filename = 'largest_face.dxf'
                dxf_path = os.path.join(output_dir, dxf_filename)
                
                if result.returncode == 0 and os.path.exists(dxf_path):
                    # Generate unique filename with timestamp
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    unique_dxf_filename = f"unfolded_{timestamp}.dxf"
                    unique_dxf_path = os.path.join(output_dir, unique_dxf_filename)
                    
                    # Rename to unique filename
                    os.rename(dxf_path, unique_dxf_path)
                    
                    return {
                        "success": True,
                        "dxf_path": unique_dxf_path,
                        "filename": unique_dxf_filename,
                        "k_factor": k_factor,
                        "message": f"Successfully unfolded STEP file to DXF"
                    }
                else:
                    error_msg = result.stderr if result.stderr else "No DXF output generated"
                    return {
                        "success": False,
                        "error": f"FreeCAD conversion failed: {error_msg}",
                        "message": "Conversion failed",
                        "exit_code": result.returncode
                    }
                    
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "error": "FreeCAD conversion timed out after 120 seconds",
                    "message": "Conversion timeout"
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"FreeCAD execution error: {str(e)}",
                    "message": "Execution failed"
                }
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Unfolding operation failed: {str(e)}",
            "message": f"Error: {str(e)}"
        }
    
    finally:
        unfolder_status["is_running"] = False
        unfolder_status["message"] = "Ready"

async def get_unfolder_status() -> Dict:
    """Check if an unfolding operation is currently running."""
    return unfolder_status

async def upload_unfolded_result(
    dxf_path: str,
    upload_url: str,
    method: str = "PUT"
) -> Dict:
    """
    Upload the unfolded DXF file to a specified URL.
    
    Args:
        dxf_path: Path to the unfolded DXF file
        upload_url: URL to upload the file to
        method: HTTP method to use (PUT or POST)
        
    Returns:
        Dictionary containing upload status
    """
    try:
        if not os.path.exists(dxf_path):
            return {"error": "DXF file not found", "success": False}
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            with open(dxf_path, 'rb') as f:
                content = f.read()
            
            headers = {
                'Content-Type': 'application/dxf',
                'Content-Length': str(len(content))
            }
            
            if method.upper() == "PUT":
                response = await client.put(upload_url, content=content, headers=headers)
            else:
                files = {'file': (os.path.basename(dxf_path), content, 'application/dxf')}
                response = await client.post(upload_url, files=files)
            
            response.raise_for_status()
            
            return {
                "success": True,
                "status_code": response.status_code,
                "message": "File uploaded successfully",
                "upload_url": upload_url
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"Upload failed: {str(e)}"
        }

async def upload_to_supabase_storage(
    dxf_path: str,
    bucket_name: str = "dxffiles",
    folder_path: Optional[str] = None
) -> Dict:
    """
    Upload the unfolded DXF file to Supabase storage.
    
    Args:
        dxf_path: Path to the unfolded DXF file
        bucket_name: Storage bucket name (default: "dxffiles")
        folder_path: Folder path within the bucket (optional)
        
    Returns:
        Dictionary containing:
        - success: Boolean indicating if upload succeeded
        - public_url: Public URL of the uploaded file
        - path: Storage path of the file
        - message: Status message
    """
    try:
        if not os.path.exists(dxf_path):
            return {
                "success": False,
                "error": "DXF file not found",
                "message": f"File not found at: {dxf_path}"
            }
        
        # Get Supabase credentials from environment
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_KEY')
        
        if not supabase_url or not supabase_key:
            return {
                "success": False,
                "error": "Missing Supabase configuration",
                "message": "SUPABASE_URL and SUPABASE_KEY environment variables are required"
            }
        
        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"unfolded_{timestamp}.dxf"
        storage_path = f"{folder_path}/{filename}" if folder_path else filename
        
        # Read the file
        with open(dxf_path, 'rb') as f:
            file_content = f.read()
        
        # Upload to Supabase storage using REST API
        async with httpx.AsyncClient(timeout=60.0) as client:
            upload_url = f"{supabase_url}/storage/v1/object/{bucket_name}/{storage_path}"
            headers = {
                'Authorization': f'Bearer {supabase_key}',
                'Content-Type': 'application/dxf',
                'Content-Length': str(len(file_content))
            }
            
            response = await client.post(upload_url, content=file_content, headers=headers)
            
            if response.status_code not in [200, 201]:
                return {
                    "success": False,
                    "error": f"Upload failed with status {response.status_code}",
                    "message": f"Upload failed: {response.text}"
                }
        
        # Construct public URL
        public_url = f"{supabase_url}/storage/v1/object/public/{bucket_name}/{storage_path}"
        
        return {
            "success": True,
            "public_url": public_url,
            "path": storage_path,
            "bucket": bucket_name,
            "filename": filename,
            "file_size": len(file_content),
            "message": f"Successfully uploaded to Supabase storage: {storage_path}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"Supabase upload failed: {str(e)}"
        }

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