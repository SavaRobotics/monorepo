#!/bin/bash

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please create a .env file with the following content:"
    echo "ANTHROPIC_API_KEY=your_anthropic_api_key"
    echo "SUPABASE_PAT=your_supabase_personal_access_token"
    exit 1
fi

# Load environment variables from .env file
export $(cat .env | grep -v '^#' | xargs)

# Check if required environment variables are set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: ANTHROPIC_API_KEY not set in .env file"
    exit 1
fi

if [ -z "$SUPABASE_PAT" ]; then
    echo "Error: SUPABASE_PAT not set in .env file"
    exit 1
fi

echo "Building Docker image..."
docker build -t supabase-mcp-client .

echo "Running MCP client..."
docker run -it --rm \
    -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
    -e SUPABASE_PAT="$SUPABASE_PAT" \
    supabase-mcp-client
