import { ToolDefinition } from "./types.ts";
import { SessionContext } from "../agent/context.ts";

export const addMcpServerTool: ToolDefinition = {
  name: "add_mcp_server",
  description: "Connect to a new Model Context Protocol (MCP) server via stdio.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "A unique name for this MCP server." },
      command: { type: "string", description: "The executable command to start the server." },
      args: { type: "array", items: { type: "string" }, description: "Arguments for the server command." },
      env: { type: "object", description: "Environment variables for the server process." },
    },
    required: ["name", "command"],
  },
  execute: async (args: any, context: SessionContext) => {
    try {
      await context.mcpManager.addServer({
        name: args.name,
        command: args.command,
        args: args.args,
        env: args.env,
      });
      return `Successfully connected to MCP server "${args.name}".`;
    } catch (error: any) {
      return `Error connecting to MCP server: ${error.message}`;
    }
  },
};

export const listMcpToolsTool: ToolDefinition = {
  name: "list_mcp_tools",
  description: "List all tools available from connected MCP servers.",
  input_schema: {
    type: "object",
    properties: {},
  },
  execute: async (_args: any, context: SessionContext) => {
    try {
      const serverTools = await context.mcpManager.listAllTools();
      if (serverTools.length === 0) {
        return "No MCP servers connected or no tools available.";
      }

      let output = "Available MCP Tools:\n";
      for (const { serverName, tools } of serverTools) {
        output += `\nServer: ${serverName}\n`;
        for (const tool of tools) {
          output += `- ${tool.name}: ${tool.description || "No description"}\n`;
        }
      }
      return output;
    } catch (error: any) {
      return `Error listing MCP tools: ${error.message}`;
    }
  },
};

export const useMcpToolTool: ToolDefinition = {
  name: "use_mcp_tool",
  description: "Execute a tool from a connected MCP server.",
  input_schema: {
    type: "object",
    properties: {
      serverName: { type: "string", description: "The name of the MCP server." },
      toolName: { type: "string", description: "The name of the tool to execute." },
      arguments: { type: "object", description: "Arguments to pass to the tool." },
    },
    required: ["serverName", "toolName", "arguments"],
  },
  execute: async (args: any, context: SessionContext) => {
    try {
      const result = await context.mcpManager.callTool(
        args.serverName,
        args.toolName,
        args.arguments
      );
      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      return `Error executing MCP tool: ${error.message}`;
    }
  },
};

export const listMcpResourcesTool: ToolDefinition = {
  name: "list_mcp_resources",
  description: "List all resources available from connected MCP servers.",
  input_schema: {
    type: "object",
    properties: {},
  },
  execute: async (_args: any, context: SessionContext) => {
    try {
      const serverResources = await context.mcpManager.listAllResources();
      if (serverResources.length === 0) {
        return "No MCP servers connected or no resources available.";
      }

      let output = "Available MCP Resources:\n";
      for (const { serverName, resources } of serverResources) {
        output += `\nServer: ${serverName}\n`;
        for (const res of resources) {
          output += `- ${res.name} (${res.uri}): ${res.description || "No description"}\n`;
        }
      }
      return output;
    } catch (error: any) {
      return `Error listing MCP resources: ${error.message}`;
    }
  },
};

export const readMcpResourceTool: ToolDefinition = {
  name: "read_mcp_resource",
  description: "Read a resource from a connected MCP server.",
  input_schema: {
    type: "object",
    properties: {
      serverName: { type: "string", description: "The name of the MCP server." },
      uri: { type: "string", description: "The URI of the resource to read." },
    },
    required: ["serverName", "uri"],
  },
  execute: async (args: any, context: SessionContext) => {
    try {
      const result = await context.mcpManager.readResource(args.serverName, args.uri);
      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      return `Error reading MCP resource: ${error.message}`;
    }
  },
};

export const searchMcpToolsTool: ToolDefinition = {
  name: "search_mcp_tools",
  description: "Search for tools across all connected MCP servers by name or description.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
    },
    required: ["query"],
  },
  execute: async (args: any, context: SessionContext) => {
    try {
      const results = await context.mcpManager.searchTools(args.query);
      if (results.length === 0) {
        return `No MCP tools found matching "${args.query}".`;
      }

      let output = `Found ${results.length} MCP tools matching "${args.query}":\n`;
      for (const { serverName, tool } of results) {
        output += `\n[${serverName}] ${tool.name}\n`;
        output += `Description: ${tool.description || "No description"}\n`;
      }
      return output;
    } catch (error: any) {
      return `Error searching MCP tools: ${error.message}`;
    }
  },
};
