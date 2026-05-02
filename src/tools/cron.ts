import cron from "node-cron";
import { exec } from "child_process";
import { ToolDefinition } from "./types";
import { CronJob } from "../agent/context";

export const cronStartTool: ToolDefinition = {
  name: "cron_start",
  description: "Schedule a background bash command using a Cron expression.",
  input_schema: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Standard cron expression (e.g. '* * * * *')" },
      command: { type: "string", description: "Bash command to execute periodically" }
    },
    required: ["expression", "command"]
  },
  execute: async (input, context) => {
    if (!cron.validate(input.expression)) {
      return `Error: Invalid cron expression '${input.expression}'`;
    }

    const id = `cron_${Math.random().toString(36).substr(2, 6)}`;
    
    // We execute the command but don't return the output to the agent loop
    // since it happens asynchronously in the background.
    const task = cron.schedule(input.expression, () => {
      exec(input.command, { cwd: context.workingDirectory }, (err, stdout, stderr) => {
        // Output is swallowed in background, though could optionally write to a log file
      });
    });

    const job: CronJob = {
      id,
      expression: input.expression,
      command: input.command,
      task
    };

    context.cronJobs.set(id, job);

    return `Successfully scheduled cron job [${id}] with expression '${input.expression}' to run: ${input.command}`;
  }
};

export const cronStopTool: ToolDefinition = {
  name: "cron_stop",
  description: "Stop a running cron job by its ID.",
  input_schema: {
    type: "object",
    properties: {
      job_id: { type: "string" }
    },
    required: ["job_id"]
  },
  execute: async (input, context) => {
    const job = context.cronJobs.get(input.job_id);
    if (!job) {
      return `Error: Cron job '${input.job_id}' not found.`;
    }

    job.task.stop();
    context.cronJobs.delete(input.job_id);

    return `Successfully stopped and removed cron job [${input.job_id}].`;
  }
};

export const cronListTool: ToolDefinition = {
  name: "cron_list",
  description: "List all active cron jobs.",
  input_schema: {
    type: "object",
    properties: {}
  },
  execute: async (_, context) => {
    if (context.cronJobs.size === 0) {
      return "No active cron jobs.";
    }

    const lines: string[] = [];
    for (const [id, job] of context.cronJobs.entries()) {
      lines.push(`[${id}] Expression: '${job.expression}' | Command: '${job.command}'`);
    }

    return lines.join("\n");
  }
};
