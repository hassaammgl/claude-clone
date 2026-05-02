import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import type { ScheduledTask } from "node-cron";
import { McpManager } from "../mcp/client.ts";
import fs from "fs";
import path from "path";

export interface Task {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "done";
}

export interface CronJob {
  id: string;
  expression: string;
  command: string;
  task: ScheduledTask;
}

export interface SessionContext {
  sessionId: string;
  workingDirectory: string;
  previousWorkingDirectory: string;
  messages: MessageParam[];
  tasks: Task[];
  cronJobs: Map<string, CronJob>;
  planMode: boolean;
  plan: string;
  mcpManager: McpManager;
  backgroundProcesses: Map<string, any>;
}

export function createContext(initialPrompt?: string): SessionContext {
  const messages: MessageParam[] = [];
  
  // Load CLAUDE.md if it exists in the current directory
  const claudeMdPath = path.join(process.cwd(), "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    try {
      const content = fs.readFileSync(claudeMdPath, "utf-8");
      messages.push({ 
        role: "user", 
        content: `CONTEXT (CLAUDE.md):\n\n${content}` 
      });
      messages.push({
        role: "assistant",
        content: "I have read CLAUDE.md and will follow the project-specific instructions provided."
      });
    } catch (e) {
      console.error("Error reading CLAUDE.md:", e);
    }
  }

  if (initialPrompt) {
    messages.push({ role: "user", content: initialPrompt });
  }

  return {
    sessionId: crypto.randomUUID(),
    workingDirectory: process.cwd(),
    previousWorkingDirectory: process.cwd(),
    messages,
    tasks: [],
    cronJobs: new Map(),
    planMode: false,
    plan: "",
    mcpManager: new McpManager(),
    backgroundProcesses: new Map()
  };
}
