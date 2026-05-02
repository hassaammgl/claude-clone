import { execFile, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { ToolDefinition } from "./types";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export const enterWorktreeTool: ToolDefinition = {
  name: "enter_worktree",
  description: "Create and enter a Git worktree for an isolated branch. Updates the session working directory so all subsequent tools operate inside the new worktree.",
  input_schema: {
    type: "object",
    properties: {
      branch_name: { type: "string", description: "The git branch name to create or checkout in the worktree" },
      worktree_path: { type: "string", description: "Optional path for the worktree directory (defaults to ../<branch_name>)" },
      create_branch: { type: "boolean", description: "If true, creates the branch if it does not exist (default: false)" }
    },
    required: ["branch_name"]
  },
  execute: async (input, context) => {
    try {
      const worktreePath = input.worktree_path
        ? path.resolve(context.workingDirectory, input.worktree_path)
        : path.resolve(context.workingDirectory, "..", input.branch_name);

      const args = ["worktree", "add"];
      if (input.create_branch) {
        args.push("-b");
      }
      args.push(worktreePath, input.branch_name);

      await execFileAsync("git", args, { cwd: context.workingDirectory });

      // Update the session context
      context.previousWorkingDirectory = context.workingDirectory;
      context.workingDirectory = worktreePath;

      return [
        `✅ Worktree created at: ${worktreePath}`,
        `Branch: ${input.branch_name}`,
        `Working directory is now: ${worktreePath}`,
        `Previous directory saved. Call exit_worktree to return.`
      ].join("\n");
    } catch (e: any) {
      return `Error creating worktree: ${e.stderr || e.message}`;
    }
  }
};

export const exitWorktreeTool: ToolDefinition = {
  name: "exit_worktree",
  description: "Exit the current Git worktree and return to the previous working directory. Optionally remove the worktree.",
  input_schema: {
    type: "object",
    properties: {
      remove: { type: "boolean", description: "If true, runs 'git worktree remove' to delete the worktree directory after exiting (default: false)" }
    }
  },
  execute: async (input, context) => {
    const currentWorktree = context.workingDirectory;
    const returnTo = context.previousWorkingDirectory;

    if (currentWorktree === returnTo) {
      return "Warning: You are not currently in a worktree (working directory hasn't changed). Nothing to exit.";
    }

    // Restore previous working directory first
    context.workingDirectory = returnTo;
    context.previousWorkingDirectory = returnTo;

    // Optionally remove the worktree
    if (input.remove === true) {
      try {
        await execAsync(`git worktree remove "${currentWorktree}" --force`, { cwd: returnTo });
        return [
          `✅ Exited and removed worktree: ${currentWorktree}`,
          `Working directory restored to: ${returnTo}`
        ].join("\n");
      } catch (e: any) {
        return [
          `✅ Exited worktree. Working directory restored to: ${returnTo}`,
          `⚠️  Failed to remove worktree (you may do it manually): ${e.stderr || e.message}`
        ].join("\n");
      }
    }

    return [
      `✅ Exited worktree: ${currentWorktree}`,
      `Working directory restored to: ${returnTo}`,
      `Tip: The worktree still exists on disk. Pass { remove: true } to clean it up.`
    ].join("\n");
  }
};
