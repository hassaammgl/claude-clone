import { spawn } from "child_process";
import { ToolDefinition } from "./types.ts";
import { SessionContext } from "../agent/context.ts";

export const monitorTool: ToolDefinition = {
  name: "monitor",
  description: "Run a command in the background and watch for a specific output pattern. When the pattern matches, it will be recorded.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "A unique identifier for this monitor." },
      command: { type: "string", description: "The command to run (e.g., 'npm start')." },
      trigger_pattern: { type: "string", description: "A regex pattern to watch for in the output." },
    },
    required: ["id", "command", "trigger_pattern"],
  },
  execute: async (args: any, context: SessionContext) => {
    if (context.backgroundProcesses.has(args.id)) {
      return `Monitor with ID "${args.id}" is already running.`;
    }

    const [cmd, ...cmdArgs] = args.command.split(" ");
    const child = spawn(cmd, cmdArgs, {
      cwd: context.workingDirectory,
      shell: true,
    });

    const monitorState = {
      id: args.id,
      command: args.command,
      pattern: new RegExp(args.trigger_pattern),
      triggered: false,
      lastMatch: "",
      output: "",
      pid: child.pid,
    };

    child.stdout.on("data", (data) => {
      const text = data.toString();
      monitorState.output += text;
      if (monitorState.pattern.test(text) && !monitorState.triggered) {
        monitorState.triggered = true;
        monitorState.lastMatch = text;
        // In a real implementation, we would emit an event here
      }
    });

    child.stderr.on("data", (data) => {
      monitorState.output += data.toString();
    });

    child.on("close", (code) => {
      context.backgroundProcesses.delete(args.id);
    });

    context.backgroundProcesses.set(args.id, { child, state: monitorState });

    return `Monitor "${args.id}" started in background. Watching for pattern: ${args.trigger_pattern}`;
  },
};

export const monitorListTool: ToolDefinition = {
  name: "monitor_list",
  description: "List all active background monitors and their current status.",
  input_schema: {
    type: "object",
    properties: {},
  },
  execute: async (_args: any, context: SessionContext) => {
    if (context.backgroundProcesses.size === 0) {
      return "No active background monitors.";
    }

    let output = "Active Monitors:\n";
    for (const [id, proc] of context.backgroundProcesses.entries()) {
      const state = proc.state;
      output += `- [${id}] Command: ${state.command}\n`;
      output += `  Triggered: ${state.triggered ? "YES" : "NO"}\n`;
      if (state.triggered) {
        output += `  Last Match: ${state.lastMatch.trim()}\n`;
      }
    }
    return output;
  },
};

export const monitorStopTool: ToolDefinition = {
  name: "monitor_stop",
  description: "Stop a background monitor.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the monitor to stop." },
    },
    required: ["id"],
  },
  execute: async (args: any, context: SessionContext) => {
    const proc = context.backgroundProcesses.get(args.id);
    if (!proc) {
      return `Monitor with ID "${args.id}" not found.`;
    }

    proc.child.kill();
    context.backgroundProcesses.delete(args.id);
    return `Monitor "${args.id}" stopped.`;
  },
};
