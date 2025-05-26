# Supabase MCP Client with Anthropic

This project demonstrates how to use Anthropic's Claude API with the Model Context Protocol (MCP) to interact with Supabase databases.

## Prerequisites

- Docker and Docker Compose installed
- Anthropic API key
- Supabase Personal Access Token (PAT)

## Setup

1. **Clone or create this project directory**

2. **Create a `.env` file** by copying `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. **Add your API keys** to the `.env` file:
   - Get your Anthropic API key from [Anthropic Console](https://console.anthropic.com/settings/keys)
   - Get your Supabase PAT from [Supabase Dashboard](https://supabase.com/dashboard/account/tokens)

4. **Make the run script executable**:
   ```bash
   chmod +x docker-run.sh
   ```

## Running the Application

### Option 1: Using the Docker run script
```bash
./docker-run.sh
```

### Option 2: Using Docker Compose
```bash
docker-compose up --build
```

### Option 3: Running locally (without Docker)
```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Node.js and npx (required for Supabase MCP server)
# Then run:
python client.py
```

## How it Works

1. The client connects to the Supabase MCP server using `npx @supabase/mcp`
2. It authenticates using your Supabase Personal Access Token
3. The MCP server exposes various tools that Claude can use to interact with your database
4. When you make a query, Claude decides which tools to use and executes them
5. The results are processed and returned in a natural language response

## Initial Query

When the client starts, it automatically runs this query:
> "Can you read from my 'parts' table and tell me what data is in there? Show me a summary of the table structure and some sample data."

After the initial query, you can continue chatting and asking questions about your database.

## Available MCP Tools

The Supabase MCP server provides over 20 tools, including:
- Database queries and management
- Table creation and modification
- Data fetching and reporting
- Project configuration
- Database branching
- TypeScript type generation

## Example Queries

- "Show me all tables in my database"
- "Create a new table called 'products' with id, name, and price columns"
- "What's the schema of the 'parts' table?"
- "Run a SQL query to count all records in the parts table"
- "Generate TypeScript types for my database"

## Troubleshooting

1. **Connection errors**: Make sure your Supabase PAT is valid and has the necessary permissions
2. **Tool execution errors**: Check that the requested table/database exists in your Supabase project
3. **Docker issues**: Ensure Docker daemon is running and you have proper permissions

## Security Notes

- Never commit your `.env` file to version control
- Keep your API keys secure
- The Supabase PAT provides access to your databases, so handle it carefully
