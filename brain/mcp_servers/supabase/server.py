"""Supabase operations MCP server."""

import os
from typing import Any, Dict, List, Optional
from fastmcp import FastMCP
from supabase import create_client, Client
import structlog

# Initialize FastMCP server
mcp = FastMCP("Supabase")

# Logger
logger = structlog.get_logger()

# Supabase client singleton
_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """Get or create Supabase client."""
    global _supabase_client
    
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
        key = os.getenv("SUPABASE_KEY", "")
        
        if not key:
            raise ValueError("SUPABASE_KEY environment variable is required")
            
        _supabase_client = create_client(url, key)
        logger.info("Supabase client initialized", url=url)
    
    return _supabase_client


@mcp.tool()
async def query_table(table_name: str, select: str = "*", filters: Optional[Dict[str, Any]] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    """Query a Supabase table.
    
    Args:
        table_name: Name of the table to query
        select: Columns to select (default: "*")
        filters: Optional dictionary of filters to apply
        limit: Optional limit on number of results
        
    Returns:
        Query results
    """
    try:
        client = get_supabase_client()
        
        # Start building query
        query = client.table(table_name).select(select)
        
        # Apply filters if provided
        if filters:
            for column, value in filters.items():
                query = query.eq(column, value)
        
        # Apply limit if provided
        if limit:
            query = query.limit(limit)
        
        # Execute query
        response = query.execute()
        
        return {
            "success": True,
            "data": response.data,
            "count": len(response.data)
        }
        
    except Exception as e:
        logger.error("Query failed", table=table_name, error=str(e))
        return {
            "success": False,
            "error": str(e),
            "data": []
        }


@mcp.tool()
async def insert_row(table_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Insert a row into a Supabase table.
    
    Args:
        table_name: Name of the table
        data: Data to insert
        
    Returns:
        Inserted row or error
    """
    try:
        client = get_supabase_client()
        
        response = client.table(table_name).insert(data).execute()
        
        return {
            "success": True,
            "data": response.data,
            "message": f"Successfully inserted row into {table_name}"
        }
        
    except Exception as e:
        logger.error("Insert failed", table=table_name, error=str(e))
        return {
            "success": False,
            "error": str(e)
        }


@mcp.tool()
async def update_row(table_name: str, filters: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
    """Update rows in a Supabase table.
    
    Args:
        table_name: Name of the table
        filters: Dictionary of filters to identify rows to update
        data: Data to update
        
    Returns:
        Updated rows or error
    """
    try:
        client = get_supabase_client()
        
        # Build update query with filters
        query = client.table(table_name).update(data)
        
        for column, value in filters.items():
            query = query.eq(column, value)
            
        response = query.execute()
        
        return {
            "success": True,
            "data": response.data,
            "count": len(response.data),
            "message": f"Successfully updated {len(response.data)} rows in {table_name}"
        }
        
    except Exception as e:
        logger.error("Update failed", table=table_name, error=str(e))
        return {
            "success": False,
            "error": str(e)
        }


@mcp.tool()
async def delete_row(table_name: str, filters: Dict[str, Any]) -> Dict[str, Any]:
    """Delete rows from a Supabase table.
    
    Args:
        table_name: Name of the table
        filters: Dictionary of filters to identify rows to delete
        
    Returns:
        Deleted rows or error
    """
    try:
        client = get_supabase_client()
        
        # Build delete query with filters
        query = client.table(table_name).delete()
        
        for column, value in filters.items():
            query = query.eq(column, value)
            
        response = query.execute()
        
        return {
            "success": True,
            "data": response.data,
            "count": len(response.data),
            "message": f"Successfully deleted {len(response.data)} rows from {table_name}"
        }
        
    except Exception as e:
        logger.error("Delete failed", table=table_name, error=str(e))
        return {
            "success": False,
            "error": str(e)
        }


@mcp.tool()
async def list_tables() -> List[str]:
    """List all tables in the Supabase database.
    
    Returns:
        List of table names
    """
    try:
        client = get_supabase_client()
        
        # Query the information schema to get all tables
        response = client.rpc('get_tables', {}).execute()
        
        if response.data:
            return [table['table_name'] for table in response.data]
        
        # Fallback: return common table names if RPC not available
        return ["Note: Could not fetch table list. Use query_table with known table names."]
        
    except Exception as e:
        logger.error("Failed to list tables", error=str(e))
        return [f"Error listing tables: {str(e)}"]


@mcp.tool()
async def call_rpc(function_name: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Call a Supabase RPC function.
    
    Args:
        function_name: Name of the RPC function
        params: Optional parameters for the function
        
    Returns:
        Function result or error
    """
    try:
        client = get_supabase_client()
        
        response = client.rpc(function_name, params or {}).execute()
        
        return {
            "success": True,
            "data": response.data,
            "function": function_name
        }
        
    except Exception as e:
        logger.error("RPC call failed", function=function_name, error=str(e))
        return {
            "success": False,
            "error": str(e),
            "function": function_name
        }


if __name__ == "__main__":
    mcp.run()