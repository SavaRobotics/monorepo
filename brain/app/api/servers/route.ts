import { NextRequest, NextResponse } from 'next/server';
import { getMCPManager } from '@/src/lib/mcp-singleton';

export async function GET(request: NextRequest) {
  try {
    const manager = getMCPManager();
    
    // Wait for initialization if needed
    if (!manager.isInitialized()) {
      await manager.initialize();
    }
    
    const status = manager.getServerStatus();
    const tools = manager.getAvailableTools();
    
    return NextResponse.json({
      success: true,
      servers: status,
      totalTools: tools.length,
      initialized: manager.isInitialized(),
    });
  } catch (error) {
    console.error('Failed to get server status:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        initialized: false,
      },
      { status: 500 }
    );
  }
}