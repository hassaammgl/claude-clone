import { ToolDefinition } from "./types";

const BLOCKED_IN_PLAN_MODE = ["write_file", "edit_file", "bash", "cron_start"];

export const enterPlanModeTool: ToolDefinition = {
  name: "enter_plan_mode",
  description: "Enter plan mode. In this mode, all write/edit/bash tools are blocked. Use this to safely think, read, and plan before making changes.",
  input_schema: {
    type: "object",
    properties: {}
  },
  execute: async (_, context) => {
    context.planMode = true;
    context.plan = "";
    return [
      "✅ PLAN MODE ACTIVATED",
      "You are now in read-only planning mode.",
      `The following tools are BLOCKED until you call exit_plan_mode: ${BLOCKED_IN_PLAN_MODE.join(", ")}`,
      "You may freely use: read_file, glob_search, grep_search, lsp_diagnostics, directory_tree, fetch_url, web_search, task_*, directory_tree",
      "When your plan is ready, call exit_plan_mode with your plan_summary."
    ].join("\n");
  }
};

export const exitPlanModeTool: ToolDefinition = {
  name: "exit_plan_mode",
  description: "Exit plan mode and present the plan to the user. All tools will be unlocked again after this call.",
  input_schema: {
    type: "object",
    properties: {
      plan_summary: { type: "string", description: "The complete, step-by-step plan you built in plan mode." }
    },
    required: ["plan_summary"]
  },
  execute: async (input, context) => {
    context.plan = input.plan_summary;
    context.planMode = false;
    return [
      "🚀 PLAN MODE DEACTIVATED",
      "All tools are now unlocked.",
      "Your plan has been recorded. Here it is:\n",
      "─────────────────────────────────────────",
      input.plan_summary,
      "─────────────────────────────────────────",
      "\nYou may now execute the plan. Proceed step by step."
    ].join("\n");
  }
};

/**
 * Called by the Permission Engine before the normal allow/deny check.
 * Returns true if the tool should be auto-denied due to plan mode.
 */
export function isBlockedInPlanMode(toolName: string): boolean {
  return BLOCKED_IN_PLAN_MODE.includes(toolName);
}
