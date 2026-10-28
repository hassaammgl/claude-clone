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
import type { ToolDefinition } from "./types";

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

/** Common model aliases → real tool names. */
const TOOL_ALIASES: Record<string, string> = {
  read: "read_file",
  read_file: "read_file",
  cat: "read_file",
  view_file: "read_file",
  open_file: "read_file",
  write: "write_file",
  write_file: "write_file",
  create: "write_file",
  create_file: "write_file",
  edit: "edit_file",
  edit_file: "edit_file",
  patch: "edit_file",
  str_replace: "edit_file",
  search_replace: "edit_file",
  replace: "edit_file",
  glob: "glob_search",
  glob_search: "glob_search",
  find: "glob_search",
  find_files: "glob_search",
  grep: "grep_search",
  grep_search: "grep_search",
  search: "grep_search",
  tree: "directory_tree",
  directory_tree: "directory_tree",
  ls: "directory_tree",
  list_dir: "directory_tree",
  list_files: "directory_tree",
  shell: "bash",
  bash: "bash",
  sh: "bash",
  cmd: "bash",
  run: "bash",
  execute: "bash",
  terminal: "bash",
  run_terminal_cmd: "bash",
  powershell: "powershell",
  fetch: "fetch_url",
  fetch_url: "fetch_url",
  web_search: "web_search",
  websearch: "web_search",
  search_web: "web_search",
};

export function resolveToolName(name: string): string {
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return TOOL_ALIASES[key] || name.trim();
}

export function findTool(name: string): ToolDefinition | undefined {
  const resolved = resolveToolName(name);
  return (
    allTools.find((t) => t.name === resolved) ||
    allTools.find((t) => t.name === name)
  );
}
