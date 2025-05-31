# Brain - MCP Server Hub with Next.js

A Next.js application that manages multiple Model Context Protocol (MCP) servers for AI-powered workflows.

## Overview

Brain provides a unified interface for managing and executing AI workflows using Claude through multiple specialized MCP servers:

- **Nesting Server**: Arranges DXF parts efficiently on sheets
- **Unfolder Server**: Converts STEP files to DXF using FreeCAD
- **Supabase Server**: Interfaces with Supabase PostgREST API

## Architecture

```
Next.js Web App (Port 3000)
├── API Routes (/api/workflow, /api/servers, /api/tools)
├── MCP Manager (Singleton)
└── MCP Servers (Subprocesses)
    ├── Nesting (Python)
    ├── Unfolder (TypeScript)  
    └── Supabase (Node.js)
```

## Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (optional)
- FreeCAD (for unfolder functionality)

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
ANTHROPIC_API_KEY=your-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key
K_FACTOR=0.38  # Optional, for unfolder
```

### Installation

```bash
# Install dependencies
npm install
pip3 install -r src/mcp_servers/requirements.txt

# Build TypeScript MCP servers
npx tsc -p tsconfig.build.json

# Run development server
npm run dev
```

### Docker

```bash
# Build and run with Docker Compose
docker-compose up --build
```

## API Endpoints

### POST /api/workflow
Execute an LLM workflow with MCP tools.

```json
{
  "prompt": "Your task description",
  "stream": false,  // Set to true for real-time updates
  "maxIterations": 10,
  "tools": ["nesting", "supabase"]  // Optional tool filter
}
```

### GET /api/servers
Get status of all MCP servers and their tools.

### GET /api/tools
List all available MCP tools.

### GET /api/workflow/status/:id
Get status and results of a specific workflow.

## Available MCP Tools

### Nesting Server
- `nesting_nest_parts`: Arrange DXF parts on a sheet
- `nesting_get_nesting_status`: Check nesting operation status

### Unfolder Server
- `unfolder_unfold_step_to_dxf`: Convert STEP files to DXF

### Supabase Server
- `supabase_postgrestRequest`: Execute PostgREST API requests
- `supabase_sqlToRest`: Convert SQL to PostgREST format

## Development

```bash
# Run Next.js only
npm run next:dev

# Run tests
npm test

# Build for production
npm run build
```

## Architecture Details

- **MCP Manager**: Singleton that manages server lifecycles with health checks and auto-restart
- **Workflow Manager**: Handles async LLM workflow execution with status tracking
- **API Routes**: Next.js App Router endpoints for frontend integration

## Troubleshooting

- **MCP servers not starting**: Check Python/Node.js installations and environment variables
- **FreeCAD errors**: Ensure FreeCAD is installed and accessible in PATH
- **Large file errors**: Check that `.next/` is in `.gitignore`

## License

Proprietary - Sava Robotics