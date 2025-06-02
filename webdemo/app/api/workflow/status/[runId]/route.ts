import { NextRequest } from 'next/server';
import { workflowRuns } from '../../execute/route';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;

  // Set up SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      controller.enqueue(encoder.encode('event: connected\ndata: {"connected": true}\n\n'));

      // Set up interval to check for updates
      const interval = setInterval(() => {
        const run = workflowRuns.get(runId);
        
        if (!run) {
          controller.enqueue(encoder.encode('event: error\ndata: {"error": "Run not found"}\n\n'));
          clearInterval(interval);
          controller.close();
          return;
        }

        // Send current status
        const data = JSON.stringify({
          id: run.id,
          status: run.status,
          currentStep: run.currentStep,
          steps: run.steps,
          error: run.error,
          logs: run.logs || [],
        });
        
        controller.enqueue(encoder.encode(`event: status\ndata: ${data}\n\n`));

        // Close stream when workflow is complete
        if (run.status === 'completed' || run.status === 'failed') {
          setTimeout(() => {
            clearInterval(interval);
            controller.close();
          }, 1000);
        }
      }, 500); // Check every 500ms

      // Clean up on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, { headers });
}