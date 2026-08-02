import type { ScheduledTask } from "node-cron";
import type { ChildProcess } from "child_process";
import { McpManager } from "../mcp/client.ts";
import fs from "fs";
import path from "path";
import { loadSettings } from "../config/settings";
import type { Message } from "./messages";
import { loadSessionForCwd } from "./session-store";

export type { Message } from "./messages";

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

export interface MonitorState {
  id: string;
  command: string;
  pattern: RegExp;
  triggered: boolean;
  lastMatch: string;
  output: string;
  pid?: number;
}

export interface BackgroundProcess {
  child: ChildProcess;
  state: MonitorState;
}

export interface SessionStats {
  startTime: number;
  totalTokens: {
    input: number;
    output: number;
  };
  messageCount: number;
  toolCallCount: number;
}

export interface SessionContext {
  sessionId: string;
  workingDirectory: string;
  previousWorkingDirectory: string;
  messages: Message[];
  tasks: Task[];
  cronJobs: Map<string, CronJob>;
  planMode: boolean;
  plan: string;
  mcpManager: McpManager;
  backgroundProcesses: Map<string, BackgroundProcess>;
  stats: SessionStats;
}

function buildStartupWelcome(): string {
  const settings = loadSettings();
  const waifuStatus = settings.waifuMode ? "ON 🌸" : "OFF";
  return `╔══════════════════════════════════════════╗
║     🌸  Welcome to Noni-chan CLI!  🌸     ║
╚══════════════════════════════════════════╝

📋 /help             Show all commands
   /clear            Clear conversation history
   /settings         Show current session settings
   /permissions      Show always-allowed tools

🤖 /models           List available Ollama models
   /models <name>    Switch to a specific Ollama model
   /waifu            Toggle waifu mode (currently: ${waifuStatus})

🛠️ /setup            Quick-approve multiple tools at once
   /mcp              List connected MCP servers & tools

Type your question or command to get started!`;
}

function freshContext(initialPrompt?: string): SessionContext {
  const messages: Message[] = [];

  messages.push({
    role: "user",
    content: "__startup__",
  });
  messages.push({
    role: "assistant",
    content: buildStartupWelcome(),
  });

  const claudeMdPath = path.join(process.cwd(), "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    try {
      const content = fs.readFileSync(claudeMdPath, "utf-8");
      messages.push({
        role: "user",
        content: `CONTEXT (CLAUDE.md):\n\n${content}`,
      });
      messages.push({
        role: "assistant",
        content:
          "I have read CLAUDE.md and will follow the project-specific instructions provided.",
      });
    } catch (error: unknown) {
      console.error("Error reading CLAUDE.md:", error);
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
    backgroundProcesses: new Map(),
    stats: {
      startTime: Date.now(),
      totalTokens: { input: 0, output: 0 },
      messageCount: messages.length,
      toolCallCount: 0,
    },
  };
}

export function createContext(
  initialPrompt?: string,
  options?: { resume?: boolean },
): SessionContext {
  const resume = options?.resume !== false;
  const cwd = process.cwd();

  if (resume && !initialPrompt) {
    const stored = loadSessionForCwd(cwd);
    if (stored && stored.messages.length > 0) {
      return {
        sessionId: stored.sessionId,
        workingDirectory: cwd,
        previousWorkingDirectory: cwd,
        messages: stored.messages,
        tasks: stored.tasks || [],
        cronJobs: new Map(),
        planMode: stored.planMode || false,
        plan: stored.plan || "",
        mcpManager: new McpManager(),
        backgroundProcesses: new Map(),
        stats: {
          startTime: stored.stats?.startTime || Date.now(),
          totalTokens: stored.stats?.totalTokens || { input: 0, output: 0 },
          messageCount: stored.messages.length,
          toolCallCount: stored.stats?.toolCallCount || 0,
        },
      };
    }
  }

  return freshContext(initialPrompt);
}
