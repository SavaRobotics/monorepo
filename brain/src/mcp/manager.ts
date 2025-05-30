import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerConfig, MCPServerInstance, MCPManager } from './types';

export class MCPServerManager implements MCPManager {
  public servers: Map<string, MCPServerInstance> = new Map();

  // Get running servers for health checks
  public getRunningServers(): Map<string, MCPServerInstance> {
    return new Map(this.servers);
  }

  async startServer(config: MCPServerConfig): Promise<MCPServerInstance> {
    console.log(`🚀 Starting MCP server: ${config.name}`);
    
    // Check if server is enabled
    if (!config.enabled()) {
      throw new Error(`MCP server ${config.name} is not enabled (missing environment variables?)`);
    }

    // Create MCP client
    const client = new Client(
      {
        name: `${config.name}-client`,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Create transport with environment variables
    const envVars: Record<string, string> = {};
    
    // Copy process.env, filtering out undefined values
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        envVars[key] = value;
      }
    }
    
    // Add config env variables
    if (config.env) {
      Object.assign(envVars, config.env);
    }
    
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: envVars
    });

    try {
      // Connect to the server
      console.log(`🔌 Connecting to ${config.name} with command: ${config.command} ${config.args.join(' ')}`);
      await client.connect(transport);
      console.log(`✅ Connected to ${config.name} MCP server`);

      // Get available tools
      console.log(`📋 Listing tools for ${config.name}...`);
      const toolsResponse = await client.listTools();
      const tools = toolsResponse.tools;
      console.log(`🔧 ${config.name} tools:`, tools.map(t => t.name).join(', '));

      const serverInstance: MCPServerInstance = {
        config,
        client,
        transport,
        tools
      };

      this.servers.set(config.name, serverInstance);
      return serverInstance;

    } catch (error) {
      console.error(`❌ Failed to start ${config.name} MCP server:`, error);
      console.error(`❌ Command was: ${config.command} ${config.args.join(' ')}`);
      console.error(`❌ Environment variables:`, config.env);
      throw error;
    }
  }

  async stopServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (server) {
      console.log(`🛑 Stopping MCP server: ${name}`);
      await server.client.close();
      this.servers.delete(name);
    }
  }

  getAllTools(): any[] {
    const allTools: any[] = [];
    
    for (const [serverName, serverInstance] of this.servers) {
      // Add server prefix to tool names to avoid conflicts
      // Use underscore instead of colon for Anthropic API compatibility
      const prefixedTools = serverInstance.tools.map(tool => ({
        ...tool,
        name: `${serverName}_${tool.name}`,
        _originalName: tool.name,
        _serverName: serverName
      }));
      allTools.push(...prefixedTools);
    }
    
    return allTools;
  }

  async executeToolCall(toolName: string, args: Record<string, unknown>): Promise<any> {
    // Parse server name and tool name from prefixed tool name
    const [serverName, ...toolNameParts] = toolName.includes('_') 
      ? toolName.split('_')
      : [null, toolName];

    if (!serverName) {
      throw new Error(`Tool ${toolName} does not specify a server`);
    }

    // Rejoin the tool name parts (in case tool name has underscores)
    const originalToolName = toolNameParts.join('_');
    
    console.log(`🔍 Debug: toolName=${toolName}, serverName=${serverName}, originalToolName=${originalToolName}`);

    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server ${serverName} not found`);
    }

    console.log(`🔧 Executing ${serverName}:${originalToolName} with args:`, JSON.stringify(args, null, 2));

    try {
      const result = await server.client.callTool({
        name: originalToolName,
        arguments: args
      });

      console.log(`✅ Tool ${toolName} executed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Tool ${toolName} execution failed:`, error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up MCP servers...');
    
    const stopPromises = Array.from(this.servers.keys()).map(name => 
      this.stopServer(name)
    );
    
    await Promise.all(stopPromises);
    console.log('✅ All MCP servers stopped');
  }

  // Helper method to start multiple servers
  async startServers(configs: MCPServerConfig[]): Promise<void> {
    const enabledConfigs = configs.filter(config => config.enabled());
    
    if (enabledConfigs.length === 0) {
      console.warn('⚠️ No MCP servers are enabled');
      return;
    }

    console.log(`🚀 Starting ${enabledConfigs.length} MCP servers...`);
    
    // Start servers sequentially to avoid overwhelming the system
    for (const config of enabledConfigs) {
      try {
        await this.startServer(config);
      } catch (error) {
        console.error(`❌ Failed to start ${config.name}, continuing with others...`);
        // Continue with other servers instead of failing fast
        // You can change this behavior based on your preferences
      }
    }

    console.log(`✅ Started ${this.servers.size} MCP servers successfully`);
  }
}