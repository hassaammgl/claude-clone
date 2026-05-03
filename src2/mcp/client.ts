import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class McpManager {
  private clients: Map<string, Client> = new Map();
  private servers: Map<string, McpServerConfig> = new Map();

  getServers(): McpServerConfig[] {
    return Array.from(this.servers.values());
  }

  async addServer(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      throw new Error(`MCP server "${config.name}" is already connected.`);
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
    });

    const client = new Client(
      {
        name: "claude-clone-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );

    await client.connect(transport);
    this.clients.set(config.name, client);
    this.servers.set(config.name, config);
  }

  async listAllTools(): Promise<{ serverName: string; tools: Tool[] }[]> {
    const allTools: { serverName: string; tools: Tool[] }[] = [];

    for (const [name, client] of this.clients.entries()) {
      const response = await client.listTools();
      allTools.push({
        serverName: name,
        tools: response.tools,
      });
    }

    return allTools;
  }

  async listAllResources(): Promise<{ serverName: string; resources: any[] }[]> {
    const allResources: { serverName: string; resources: any[] }[] = [];

    for (const [name, client] of this.clients.entries()) {
      try {
        const response = await client.listResources();
        allResources.push({
          serverName: name,
          resources: response.resources,
        });
      } catch (e) {
        // Some servers might not support resources
      }
    }

    return allResources;
  }

  async readResource(serverName: string, uri: string): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server "${serverName}" not found.`);
    }

    return await client.readResource({
      uri,
    });
  }

  async searchTools(query: string): Promise<{ serverName: string; tool: Tool }[]> {
    const results: { serverName: string; tool: Tool }[] = [];
    const allServerTools = await this.listAllTools();
    
    const lowerQuery = query.toLowerCase();
    for (const { serverName, tools } of allServerTools) {
      for (const tool of tools) {
        if (
          tool.name.toLowerCase().includes(lowerQuery) ||
          (tool.description && tool.description.toLowerCase().includes(lowerQuery))
        ) {
          results.push({ serverName, tool });
        }
      }
    }
    
    return results;
  }

  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server "${serverName}" not found.`);
    }

    return await client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  async shutdown(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
    this.servers.clear();
  }
}
