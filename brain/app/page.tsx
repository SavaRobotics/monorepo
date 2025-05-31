'use client';

import { useState } from 'react';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [isTestingUnfolder, setIsTestingUnfolder] = useState(false);
  const [unfolderResult, setUnfolderResult] = useState<any>(null);
  const [unfolderError, setUnfolderError] = useState<string>('');

  const testUnfolderService = async () => {
    setIsTestingUnfolder(true);
    setUnfolderError('');
    setUnfolderResult(null);

    try {
      const response = await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Please test the unfolder service by calling the unfold_step_file tool directly with these parameters:
          - step_url: https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles/test.step
          - k_factor: 0.38
          
          Just call this one tool and return the result. Don't proceed with any other tools.`,
          model: 'claude-3-5-sonnet-20241022',
          temperature: 0,
          maxTokens: 4096,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setUnfolderResult(data);
      
      // If we get a workflow ID, poll for status
      if (data.id) {
        pollUnfolderStatus(data.id);
      }
    } catch (err) {
      setUnfolderError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsTestingUnfolder(false);
    }
  };

  const pollUnfolderStatus = async (workflowId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/workflow/status/${workflowId}`);
        const data = await response.json();
        
        setUnfolderResult(data);
        
        if (data.status === 'completed' || data.status === 'error') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        clearInterval(pollInterval);
        setUnfolderError('Failed to fetch workflow status');
      }
    }, 2000); // Poll every 2 seconds
  };

  const runCompleteWorkflow = async () => {
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `You have access to multiple MCP tools for various operations.

Please help me with the following integrated workflow:

1. First, use the unfold_step_file tool to convert the STEP file from URL: https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles/test.step
   - Use K-factor 0.38 for the conversion
   
2. Once the DXF is generated successfully, use the upload_to_supabase_storage tool to upload it to the "dxffiles" bucket
   
3. After uploading the unfolded DXF, query the Supabase "parts" table to get all DXF URLs where dxf_url is not null
   
4. Then use the nesting tools to nest ALL the DXF parts (including the newly uploaded one) on a 1000x500mm sheet with 2mm spacing

5. Upload the nested DXF to supabase dxffiles bucket also using Supabase mcp
   
6. Show me the complete results including:
   - The public URL of the uploaded unfolded DXF
   - The nesting results with utilization percentage
   - The G-code generation status
   - Any parts that couldn't fit on the sheet

Use the appropriate tools to accomplish this integrated workflow.`,
          model: 'claude-3-5-sonnet-20241022',
          temperature: 0,
          maxTokens: 4096,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      
      // If we get a workflow ID, we can poll for status
      if (data.id) {
        pollWorkflowStatus(data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const pollWorkflowStatus = async (workflowId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/workflow/status/${workflowId}`);
        const data = await response.json();
        
        setResult(data);
        
        if (data.status === 'completed' || data.status === 'error') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        clearInterval(pollInterval);
        setError('Failed to fetch workflow status');
      }
    }, 2000); // Poll every 2 seconds
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">Brain - MCP Server Hub</h1>
        <p className="mb-4">
          This is the web interface for the Brain module, which manages multiple MCP servers.
        </p>
        
        <div className="mb-8 p-6 bg-gray-100 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Run Complete Workflow</h2>
          <p className="mb-4">
            This will execute the complete workflow: Unfold STEP → Upload DXF → Nest Parts → Generate G-code
          </p>
          <button
            onClick={runCompleteWorkflow}
            disabled={isLoading}
            className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            }`}
          >
            {isLoading ? 'Running Workflow...' : 'Start Workflow'}
          </button>
        </div>

        <div className="mb-8 p-6 bg-blue-100 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Test Unfolder Service</h2>
          <p className="mb-4">
            Test the unfolder service directly by converting a STEP file to DXF
          </p>
          <div className="flex gap-4">
            <button
              onClick={testUnfolderService}
              disabled={isTestingUnfolder}
              className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                isTestingUnfolder 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 cursor-pointer'
              }`}
            >
              {isTestingUnfolder ? 'Testing Unfolder...' : 'Test Unfolder Service'}
            </button>
            <button
              onClick={async () => {
                setIsTestingUnfolder(true);
                setUnfolderError('');
                setUnfolderResult(null);
                try {
                  const response = await fetch('/api/workflow', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      prompt: `Check the unfolder service status by calling the get_unfolder_status tool.`,
                      model: 'claude-3-5-sonnet-20241022',
                      temperature: 0,
                      maxTokens: 1000,
                    }),
                  });
                  const data = await response.json();
                  setUnfolderResult(data);
                  if (data.id) {
                    pollUnfolderStatus(data.id);
                  }
                } catch (err) {
                  setUnfolderError(err instanceof Error ? err.message : 'An unknown error occurred');
                } finally {
                  setIsTestingUnfolder(false);
                }
              }}
              disabled={isTestingUnfolder}
              className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                isTestingUnfolder 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-yellow-600 hover:bg-yellow-700 cursor-pointer'
              }`}
            >
              Check Unfolder Status
            </button>
          </div>
        </div>

        {unfolderError && (
          <div className="mb-8 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            <h3 className="font-semibold">Unfolder Test Error:</h3>
            <p>{unfolderError}</p>
          </div>
        )}

        {unfolderResult && (
          <div className="mb-8 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
            <h3 className="font-semibold mb-2">Unfolder Test Result:</h3>
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(unfolderResult, null, 2)}
            </pre>
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            <h3 className="font-semibold">Error:</h3>
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="mb-8 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
            <h3 className="font-semibold mb-2">Workflow Result:</h3>
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Available MCP Servers:</h2>
          <ul className="list-disc list-inside">
            <li>Nesting Server (Python)</li>
            <li>Supabase Server (Node.js)</li>
            <li>Unfolder Server (Python)</li>
            <li>G-code Server (Node.js)</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-4">Features:</h2>
          <ul className="list-disc list-inside">
            <li>Multi-language MCP server support</li>
            <li>Docker containerized deployment</li>
            <li>TypeScript and Python integration</li>
            <li>Real-time server management</li>
          </ul>
        </div>
      </div>
    </main>
  )
}