"""Database operations MCP server."""

import json
import sqlite3
from typing import Any, Dict, List, Optional
from pathlib import Path
from fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("Database")

# Default database path
DEFAULT_DB_PATH = "/app/data/brain.db"


@mcp.tool()
async def execute_query(query: str, params: Optional[List[Any]] = None, db_path: str = DEFAULT_DB_PATH) -> Dict[str, Any]:
    """Execute a SQL query.
    
    Args:
        query: SQL query to execute
        params: Optional parameters for the query
        db_path: Path to the SQLite database file
        
    Returns:
        Query results or error message
    """
    try:
        # Ensure database directory exists
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row  # Enable column access by name
            cursor = conn.cursor()
            
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            
            # Check if this is a SELECT query
            if query.strip().upper().startswith('SELECT'):
                rows = cursor.fetchall()
                return {
                    "success": True,
                    "rows": [dict(row) for row in rows],
                    "row_count": len(rows)
                }
            else:
                # For INSERT, UPDATE, DELETE, etc.
                conn.commit()
                return {
                    "success": True,
                    "rows_affected": cursor.rowcount,
                    "last_row_id": cursor.lastrowid
                }
                
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@mcp.tool()
async def create_table(table_name: str, schema: Dict[str, str], db_path: str = DEFAULT_DB_PATH) -> str:
    """Create a new table.
    
    Args:
        table_name: Name of the table to create
        schema: Dictionary mapping column names to their types
        db_path: Path to the SQLite database file
        
    Returns:
        Success message or error
    """
    try:
        # Build CREATE TABLE query
        columns = []
        for col_name, col_type in schema.items():
            columns.append(f"{col_name} {col_type}")
        
        query = f"CREATE TABLE IF NOT EXISTS {table_name} ({', '.join(columns)})"
        
        result = await execute_query(query, db_path=db_path)
        
        if result["success"]:
            return f"Successfully created table {table_name}"
        else:
            return f"Error creating table: {result['error']}"
            
    except Exception as e:
        return f"Error creating table: {str(e)}"


@mcp.tool()
async def insert_data(table_name: str, data: Dict[str, Any], db_path: str = DEFAULT_DB_PATH) -> str:
    """Insert data into a table.
    
    Args:
        table_name: Name of the table
        data: Dictionary of column names and values
        db_path: Path to the SQLite database file
        
    Returns:
        Success message or error
    """
    try:
        columns = list(data.keys())
        values = list(data.values())
        placeholders = ', '.join(['?' for _ in values])
        
        query = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
        
        result = await execute_query(query, values, db_path=db_path)
        
        if result["success"]:
            return f"Successfully inserted data into {table_name}, row ID: {result['last_row_id']}"
        else:
            return f"Error inserting data: {result['error']}"
            
    except Exception as e:
        return f"Error inserting data: {str(e)}"


@mcp.tool()
async def list_tables(db_path: str = DEFAULT_DB_PATH) -> List[str]:
    """List all tables in the database.
    
    Args:
        db_path: Path to the SQLite database file
        
    Returns:
        List of table names
    """
    try:
        query = "SELECT name FROM sqlite_master WHERE type='table'"
        result = await execute_query(query, db_path=db_path)
        
        if result["success"]:
            return [row["name"] for row in result["rows"]]
        else:
            return [f"Error: {result['error']}"]
            
    except Exception as e:
        return [f"Error listing tables: {str(e)}"]


@mcp.tool()
async def get_table_schema(table_name: str, db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    """Get the schema of a table.
    
    Args:
        table_name: Name of the table
        db_path: Path to the SQLite database file
        
    Returns:
        List of column information
    """
    try:
        query = f"PRAGMA table_info({table_name})"
        result = await execute_query(query, db_path=db_path)
        
        if result["success"]:
            return result["rows"]
        else:
            return [{"error": result["error"]}]
            
    except Exception as e:
        return [{"error": f"Error getting table schema: {str(e)}"}]


if __name__ == "__main__":
    mcp.run()