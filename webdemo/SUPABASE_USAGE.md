# Supabase DXF URL Fetcher

This workflow fetches DXF URLs from a Supabase `parts` table and provides analysis of the data.

## Setup

1. Install dependencies:
```bash
npm install @supabase/supabase-js
```

2. Create a `.env.local` file in the webdemo root with your Supabase credentials:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

3. Make sure you have a Supabase project with a `parts` table containing a `dxf_url` column.

## Usage

### Using the Workflow

```typescript
import { supabaseTestWorkflow } from './src/mastra/workflows/supabaseTest';

async function fetchDxfUrls() {
  // No input needed - uses environment variables
  const result = await supabaseTestWorkflow.run({});

  console.log(`Found ${result.count} DXF URLs`);
  console.log('Analysis:', result.analysis);
  console.log('URLs:', result.dxfUrls);
}
```

### Using the Tool Directly

```typescript
import { getDxfUrlsTool } from './src/mastra/tools/supabase';

async function fetchDxfUrlsDirectly() {
  const result = await getDxfUrlsTool.execute({
    context: {
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_KEY!
    },
    runtimeContext: {} // Provide appropriate runtime context
  });

  console.log(`Found ${result.count} DXF URLs:`, result.dxfUrls);
}
```

## Environment Variables

**Required environment variables in `.env.local`:**

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Expected Database Schema

The workflow expects a `parts` table with at least the following structure:

```sql
CREATE TABLE parts (
  id SERIAL PRIMARY KEY,
  dxf_url TEXT,
  -- other columns...
);
```

## Output

The workflow returns:
- `dxfUrls`: Array of all DXF URLs from the parts table
- `count`: Total number of DXF URLs found
- `analysis`: AI-generated analysis of the URL patterns and data quality 