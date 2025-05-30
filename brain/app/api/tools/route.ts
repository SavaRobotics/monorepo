import { NextRequest, NextResponse } from 'next/server';
import { getMCPManager } from '@/src/lib/mcp-singleton';

export async function GET(request: NextRequest) {
  try {
    const manager = getMCPManager();
    
    // Wait for initialization if needed
    if (!manager.isInitialized()) {
      await manager.initialize();
    }
    
    const tools = manager.getAvailableTools();
    
    return NextResponse.json({
      success: true,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description || 'No description',
        inputSchema: tool.inputSchema,
      })),
      count: tools.length,
    });
  } catch (error) {
    console.error('Failed to get tools:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        tools: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}