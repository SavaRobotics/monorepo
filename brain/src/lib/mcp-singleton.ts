import { MCPServerManager } from '../mcp/manager';
import { availableServers } from '../mcp/servers/index';
import { MCPServerConfig } from '../mcp/types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './.env' });

interface MCPSingletonOptions {
  healthCheckInterval?: number; // ms
  maxRestartAttempts?: number;
  restartDelay?: number; // ms
}

class MCPManagerSingleton {
  private static instance: MCPManagerSingleton;
  private manager: MCPServerManager;
  private initialized: boolean = false;
  private healthCheckTimer?: NodeJS.Timeout;
  private serverRestartCounts: Map<string, number> = new Map();
  private options: Required<MCPSingletonOptions>;
  private isShuttingDown: boolean = false;

  private constructor(options: MCPSingletonOptions = {}) {
    this.manager = new MCPServerManager();
    this.options = {
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      maxRestartAttempts: options.maxRestartAttempts || 3,
      restartDelay: options.restartDelay || 5000, // 5 seconds
    };
    
    // Setup shutdown hooks
    this.setupShutdownHooks();
  }

  public static getInstance(options?: MCPSingletonOptions): MCPManagerSingleton {
    if (!MCPManagerSingleton.instance) {
      MCPManagerSingleton.instance = new MCPManagerSingleton(options);
    }
    return MCPManagerSingleton.instance;
  }

  private setupShutdownHooks(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      
      console.log(`\n🛑 Received ${signal}, shutting down MCP servers gracefully...`);
      this.isShuttingDown = true;
      
      await this.cleanup();
      process.exit(0);
    };

    // Handle different termination signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('beforeExit', () => shutdown('beforeExit'));
    
    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      console.error('❌ Uncaught exception:', error);
      await this.cleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
    });
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('✅ MCP Manager already initialized');
      return;
    }

    console.log('🚀 Initializing MCP Manager Singleton...');

    try {
      // Check for required environment variables
      const requiredEnvVars = this.getRequiredEnvVars();
      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          throw new Error(`Missing required environment variable: ${envVar}`);
        }
      }

      // Start all available MCP servers
      await this.manager.startServers(availableServers);

      // Verify we have tools available
      const tools = this.manager.getAllTools();
      if (tools.length === 0) {
        throw new Error('No MCP tools available after initialization');
      }

      console.log(`✅ MCP Manager initialized with ${tools.length} tools`);
      tools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description || 'No description'}`);
      });

      // Start health monitoring
      this.startHealthMonitoring();
      
      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize MCP Manager:', error);
      await this.cleanup();
      throw error;
    }
  }

  private getRequiredEnvVars(): string[] {
    // Only check for Supabase vars if the server is configured
    const hasSupabase = availableServers.some(s => s.name === 'supabase');
    return hasSupabase ? ['SUPABASE_URL', 'SUPABASE_KEY'] : [];
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) return;
      
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);

    // Run initial health check
    setTimeout(() => this.performHealthCheck(), 1000);
  }

  private async performHealthCheck(): Promise<void> {
    const runningServers = this.manager.getRunningServers();
    
    for (const [serverName, instance] of runningServers) {
      try {
        // Try to list tools as a health check
        const tools = await instance.client.listTools();
        console.log(`✅ Health check passed for ${serverName} (${tools.tools.length} tools)`);
        
        // Reset restart count on successful health check
        this.serverRestartCounts.set(serverName, 0);
      } catch (error) {
        console.error(`❌ Health check failed for ${serverName}:`, error);
        
        // Attempt to restart the failed server
        await this.restartServer(serverName);
      }
    }
  }

  private async restartServer(serverName: string): Promise<void> {
    const restartCount = this.serverRestartCounts.get(serverName) || 0;
    
    if (restartCount >= this.options.maxRestartAttempts) {
      console.error(`❌ Max restart attempts (${this.options.maxRestartAttempts}) reached for ${serverName}. Giving up.`);
      return;
    }

    console.log(`🔄 Attempting to restart ${serverName} (attempt ${restartCount + 1}/${this.options.maxRestartAttempts})...`);
    this.serverRestartCounts.set(serverName, restartCount + 1);

    try {
      // Stop the failed server
      await this.manager.stopServer(serverName);
      
      // Wait before restarting
      await new Promise(resolve => setTimeout(resolve, this.options.restartDelay));
      
      // Find the server config
      const serverConfig = availableServers.find(s => s.name === serverName);
      if (!serverConfig) {
        console.error(`❌ Server config not found for ${serverName}`);
        return;
      }

      // Restart the server
      await this.manager.startServer(serverConfig);
      console.log(`✅ Successfully restarted ${serverName}`);
    } catch (error) {
      console.error(`❌ Failed to restart ${serverName}:`, error);
    }
  }

  public getManager(): MCPServerManager {
    if (!this.initialized) {
      throw new Error('MCP Manager not initialized. Call initialize() first.');
    }
    return this.manager;
  }

  public async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up MCP Manager...');
    
    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Cleanup manager and all servers
    await this.manager.cleanup();
    
    this.initialized = false;
    console.log('✅ MCP Manager cleanup complete');
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getAvailableTools() {
    if (!this.initialized) {
      return [];
    }
    return this.manager.getAllTools();
  }

  public async executeToolCall(toolName: string, args: Record<string, unknown>) {
    if (!this.initialized) {
      throw new Error('MCP Manager not initialized');
    }
    return this.manager.executeToolCall(toolName, args);
  }

  public getServerStatus() {
    const runningServers = this.manager.getRunningServers();
    const status: Record<string, any> = {};
    
    for (const [name, instance] of runningServers) {
      status[name] = {
        running: true,
        tools: instance.tools.map(t => ({
          name: t.name,
          description: t.description,
        })),
        restartCount: this.serverRestartCounts.get(name) || 0,
      };
    }
    
    // Add non-running servers
    for (const server of availableServers) {
      if (!status[server.name]) {
        status[server.name] = {
          running: false,
          tools: [],
          restartCount: this.serverRestartCounts.get(server.name) || 0,
        };
      }
    }
    
    return status;
  }
}

// Export singleton instance getter
export function getMCPManager(options?: MCPSingletonOptions): MCPManagerSingleton {
  return MCPManagerSingleton.getInstance(options);
}

// Initialize on module load for Next.js
if (typeof window === 'undefined') {
  // Server-side only
  const manager = getMCPManager();
  
  // Initialize asynchronously
  manager.initialize().catch(error => {
    console.error('Failed to initialize MCP Manager on module load:', error);
  });
}