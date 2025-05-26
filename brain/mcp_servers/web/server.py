"""Web operations MCP server."""

import json
from typing import Any, Dict, Optional
import httpx
from fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("Web")


@mcp.tool()
async def fetch_url(url: str, method: str = "GET", headers: Optional[Dict[str, str]] = None, timeout: int = 30) -> Dict[str, Any]:
    """Fetch content from a URL.
    
    Args:
        url: URL to fetch
        method: HTTP method (GET, POST, etc.)
        headers: Optional HTTP headers
        timeout: Request timeout in seconds
        
    Returns:
        Response data including status, headers, and content
    """
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method=method.upper(),
                url=url,
                headers=headers or {}
            )
            
            # Try to parse as JSON, fallback to text
            try:
                content = response.json()
                content_type = "json"
            except:
                content = response.text
                content_type = "text"
            
            return {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "content": content,
                "content_type": content_type,
                "url": str(response.url)
            }
    except Exception as e:
        return {
            "error": f"Error fetching URL: {str(e)}",
            "status_code": None,
            "content": None
        }


@mcp.tool()
async def post_json(url: str, data: Dict[str, Any], headers: Optional[Dict[str, str]] = None, timeout: int = 30) -> Dict[str, Any]:
    """Send JSON data to a URL via POST.
    
    Args:
        url: URL to send data to
        data: JSON data to send
        headers: Optional HTTP headers
        timeout: Request timeout in seconds
        
    Returns:
        Response data including status, headers, and content
    """
    try:
        request_headers = {"Content-Type": "application/json"}
        if headers:
            request_headers.update(headers)
            
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url=url,
                json=data,
                headers=request_headers
            )
            
            # Try to parse as JSON, fallback to text
            try:
                content = response.json()
                content_type = "json"
            except:
                content = response.text
                content_type = "text"
            
            return {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "content": content,
                "content_type": content_type,
                "url": str(response.url)
            }
    except Exception as e:
        return {
            "error": f"Error posting to URL: {str(e)}",
            "status_code": None,
            "content": None
        }


@mcp.tool()
async def download_file(url: str, local_path: str, timeout: int = 60) -> str:
    """Download a file from a URL to local storage.
    
    Args:
        url: URL to download from
        local_path: Local path to save the file
        timeout: Request timeout in seconds
        
    Returns:
        Success message or error
    """
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                
                with open(local_path, "wb") as f:
                    async for chunk in response.aiter_bytes():
                        f.write(chunk)
                        
        return f"Successfully downloaded {url} to {local_path}"
    except Exception as e:
        return f"Error downloading file: {str(e)}"


@mcp.tool()
async def check_url_status(url: str, timeout: int = 10) -> Dict[str, Any]:
    """Check if a URL is accessible and get basic info.
    
    Args:
        url: URL to check
        timeout: Request timeout in seconds
        
    Returns:
        Status information about the URL
    """
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.head(url)
            
            return {
                "url": url,
                "status_code": response.status_code,
                "accessible": response.status_code < 400,
                "headers": dict(response.headers),
                "content_type": response.headers.get("content-type"),
                "content_length": response.headers.get("content-length")
            }
    except Exception as e:
        return {
            "url": url,
            "accessible": False,
            "error": str(e),
            "status_code": None
        }


if __name__ == "__main__":
    mcp.run()