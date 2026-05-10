import { readTool } from "./read";
import { writeTool } from "./write";
import { editTool } from "./edit";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { lspTool } from "./lsp";
import { bashTool } from "./bash";
import { taskCreateTool, taskListTool, taskGetTool, taskUpdateTool, taskDeleteTool, todoWriteTool } from "./tasks";
import { cronStartTool, cronStopTool, cronListTool } from "./cron";
import { treeTool } from "./tree";
import { fetchUrlTool, webSearchTool } from "./fetch";
import { enterPlanModeTool, exitPlanModeTool } from "./plan";
import { enterWorktreeTool, exitWorktreeTool } from "./worktree";
import { spawnAgentTool, askUserQuestionTool } from "./agent";
import { addMcpServerTool, listMcpToolsTool, useMcpToolTool, listMcpResourcesTool, readMcpResourceTool, searchMcpToolsTool } from "./mcp";
import { powershellTool } from "./powershell";
import { monitorTool, monitorListTool, monitorStopTool } from "./monitor";
import { ToolDefinition } from "./types";

export const allTools: ToolDefinition[] = [
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
  lspTool,
  bashTool,
  powershellTool,
  monitorTool,
  monitorListTool,
  monitorStopTool,
  taskCreateTool,
  taskListTool,
  taskGetTool,
  taskUpdateTool,
  taskDeleteTool,
  todoWriteTool,
  cronStartTool,
  cronStopTool,
  cronListTool,
  treeTool,
  fetchUrlTool,
  webSearchTool,
  enterPlanModeTool,
  exitPlanModeTool,
  enterWorktreeTool,
  exitWorktreeTool,
  spawnAgentTool,
  askUserQuestionTool,
  addMcpServerTool,
  listMcpToolsTool,
  useMcpToolTool,
  listMcpResourcesTool,
  readMcpResourceTool,
  searchMcpToolsTool
];

export function getToolDefinitions() {
  return allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema
  }));
}

export function findTool(name: string): ToolDefinition | undefined {
  return allTools.find(t => t.name === name);
}
