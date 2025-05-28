"""MCP server for DXF part nesting functionality."""

import os
import json
import tempfile
import asyncio
from pathlib import Path
from typing import List, Dict, Optional
import httpx
from fastmcp import FastMCP
from datetime import datetime

# Import the nesting functionality
from .nest import DXFNester

# Create MCP server instance
mcp = FastMCP(
    name="nesting",
    description="DXF part nesting service for arranging parts on sheets"
)

# Global state for tracking nesting operations
nesting_status = {
    "is_running": False,
    "message": "Ready"
}

@mcp.tool(
    description="Nest DXF parts on a sheet. Accepts a list of DXF URLs and arranges them efficiently."
)
async def nest_parts(
    dxf_urls: List[str],
    sheet_width: Optional[float] = 1000.0,
    sheet_height: Optional[float] = 500.0,
    spacing: Optional[float] = 2.0
) -> Dict:
    """
    Nest DXF parts on a sheet.
    
    Args:
        dxf_urls: List of URLs to DXF files. Duplicate URLs represent multiple quantities.
        sheet_width: Width of the sheet in mm (default: 1000)
        sheet_height: Height of the sheet in mm (default: 500)
        spacing: Minimum spacing between parts in mm (default: 2)
        
    Returns:
        Dictionary containing:
        - utilization_percent: Sheet utilization percentage
        - placed_count: Number of parts successfully placed
        - total_parts: Total number of parts attempted
        - unfittable_parts: List of URLs that couldn't be placed
        - nested_dxf_path: Path to the generated nested DXF file
        - message: Status message
    """
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
            url_to_file_map = {}  # Map URLs to local files for tracking unfittable parts
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                for i, url in enumerate(dxf_urls):
                    nesting_status["message"] = f"Downloading file {i+1}/{len(dxf_urls)}..."
                    
                    try:
                        # Generate unique filename for each instance
                        filename = f"part_{i}_{Path(url).name}"
                        if not filename.endswith('.dxf'):
                            filename += '.dxf'
                        
                        filepath = os.path.join(temp_dir, filename)
                        
                        # Download the file
                        response = await client.get(url)
                        response.raise_for_status()
                        
                        with open(filepath, 'wb') as f:
                            f.write(response.content)
                        
                        downloaded_files.append(filepath)
                        url_to_file_map[filepath] = url
                        
                    except Exception as e:
                        print(f"Error downloading {url}: {e}")
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
            output_dir = tempfile.mkdtemp()
            os.environ['OUTPUT_DIR'] = output_dir
            os.environ['OUTPUT_NAME'] = 'nested_layout'
            
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
            
            # Save results JSON
            results_path = os.path.join(output_dir, 'nesting_results.json')
            with open(results_path, 'w') as f:
                json.dump(response, f, indent=2)
            
            response['results_json_path'] = results_path
            
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

@mcp.tool(
    description="Get the current status of the nesting service"
)
async def get_nesting_status() -> Dict:
    """
    Check if a nesting operation is currently running.
    
    Returns:
        Dictionary containing:
        - is_running: Boolean indicating if nesting is in progress
        - message: Current status message
    """
    return nesting_status

@mcp.tool(
    description="Upload nested DXF result to a URL endpoint"
)
async def upload_nested_result(
    nested_dxf_path: str,
    upload_url: str,
    method: Optional[str] = "PUT"
) -> Dict:
    """
    Upload the nested DXF file to a specified URL.
    
    Args:
        nested_dxf_path: Path to the nested DXF file
        upload_url: URL to upload the file to
        method: HTTP method to use (PUT or POST)
        
    Returns:
        Dictionary containing upload status
    """
    try:
        if not os.path.exists(nested_dxf_path):
            return {"error": "Nested DXF file not found", "success": False}
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            with open(nested_dxf_path, 'rb') as f:
                content = f.read()
            
            headers = {
                'Content-Type': 'application/dxf',
                'Content-Length': str(len(content))
            }
            
            if method.upper() == "PUT":
                response = await client.put(upload_url, content=content, headers=headers)
            else:
                files = {'file': ('nested_layout.dxf', content, 'application/dxf')}
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

@mcp.tool(
    description="Upload nested DXF file to Supabase storage bucket"
)
async def upload_to_supabase(
    nested_dxf_path: str,
    supabase_url: str,
    supabase_key: str,
    bucket_name: Optional[str] = "dxffiles",
    folder_path: Optional[str] = "nested"
) -> Dict:
    """
    Upload the nested DXF file to Supabase storage.
    
    Args:
        nested_dxf_path: Path to the nested DXF file
        supabase_url: Supabase project URL
        supabase_key: Supabase API key (service role key for uploads)
        bucket_name: Storage bucket name (default: "dxffiles")
        folder_path: Folder path within the bucket (default: "nested")
        
    Returns:
        Dictionary containing:
        - success: Boolean indicating if upload succeeded
        - public_url: Public URL of the uploaded file
        - path: Storage path of the file
        - message: Status message
    """
    try:
        # Lazy import to avoid dependency issues if not using this tool
        from supabase import create_client
        
        if not os.path.exists(nested_dxf_path):
            return {
                "success": False,
                "error": "Nested DXF file not found",
                "message": f"File not found at: {nested_dxf_path}"
            }
        
        # Initialize Supabase client
        supabase = create_client(supabase_url, supabase_key)
        
        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"nested_layout_{timestamp}.dxf"
        storage_path = f"{folder_path}/{filename}" if folder_path else filename
        
        # Read the file
        with open(nested_dxf_path, 'rb') as f:
            file_content = f.read()
        
        # Upload to Supabase storage
        response = supabase.storage.from_(bucket_name).upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": "application/dxf"}
        )
        
        # Get public URL
        public_url = supabase.storage.from_(bucket_name).get_public_url(storage_path)
        
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

if __name__ == "__main__":
    # Run the MCP server
    import uvicorn
    uvicorn.run(mcp.app, host="0.0.0.0", port=8002)