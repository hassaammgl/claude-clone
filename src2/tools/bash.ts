import { exec } from "child_process";
import { ToolDefinition } from "./types";

export const bashTool: ToolDefinition = {
  name: "bash",
  description: "Execute a bash command in the terminal. The working directory persists across calls. Output is captured and returned.",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The bash command to execute" },
      description: { type: "string", description: "A short description of what this command is attempting to do" }
    },
    required: ["command", "description"]
  },
  execute: async (input, context) => {
    return new Promise((resolve) => {
      // Execute the command with a 120s timeout and a 5MB output buffer
      const child = exec(
        input.command, 
        { 
          cwd: context.workingDirectory,
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 5
        },
        (error, stdout, stderr) => {
          let output = "";
          
          if (stdout) output += `STDOUT:\n${stdout}\n`;
          if (stderr) output += `STDERR:\n${stderr}\n`;
          
          if (error) {
            output += `\nCommand exited with error: ${error.message}`;
            if (error.killed) {
              output += `\nCommand was killed (likely due to 120s timeout).`;
            }
          }

          if (!output.trim()) {
            output = "Command executed successfully with no output.";
          }

          // Truncate if insanely long
          if (output.length > 20000) {
            output = output.substring(0, 20000) + "\n...[TRUNCATED]";
          }

          resolve(output);
        }
      );
    });
  }
};
