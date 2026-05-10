import { exec } from "child_process";
import { ToolDefinition } from "./types";

export const powershellTool: ToolDefinition = {
  name: "powershell",
  description: "Execute a PowerShell command in the terminal. Use this for Windows-specific tasks or when PowerShell features are needed. Output is captured and returned.",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The PowerShell command to execute" },
      description: { type: "string", description: "A short description of what this command is attempting to do" }
    },
    required: ["command", "description"]
  },
  execute: async (input, context) => {
    return new Promise((resolve) => {
      // Use 'powershell' command on Windows
      const shellCommand = `powershell -Command "${input.command.replace(/"/g, '`"')}"`;
      
      const child = exec(
        shellCommand, 
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

          if (output.length > 20000) {
            output = output.substring(0, 20000) + "\n...[TRUNCATED]";
          }

          resolve(output);
        }
      );
    });
  }
};
