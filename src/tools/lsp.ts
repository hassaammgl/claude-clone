import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { ToolDefinition } from "./types";

const execAsync = promisify(exec);

export const lspTool: ToolDefinition = {
  name: "lsp_diagnostics",
  description: "Get TypeScript compilation errors and diagnostics for the project.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", description: "Currently only supports 'diagnostics'" },
      file_path: { type: "string", description: "Optional file path to limit diagnostics to a specific file" }
    },
    required: ["action"]
  },
  execute: async (input, context) => {
    if (input.action !== "diagnostics") {
      return `Action '${input.action}' is not supported yet in LSP-lite.`;
    }

    try {
      // Check if tsconfig.json exists
      if (!fs.existsSync(path.join(context.workingDirectory, "tsconfig.json"))) {
        return "No tsconfig.json found in working directory. Cannot run TypeScript diagnostics.";
      }

      // Run tsc --noEmit. Use npx to ensure we use local typescript if available
      try {
        await execAsync("npx tsc --noEmit --pretty false", { cwd: context.workingDirectory });
        return "No TypeScript errors found! Project compiles successfully.";
      } catch (error: any) {
        // tsc exits with > 0 if there are type errors, which throws in execAsync
        const stdout = error.stdout || "";
        
        if (!stdout) {
          return `Error running TypeScript compiler: ${error.message}`;
        }

        let lines = stdout.split("\n").filter(Boolean);

        // If file_path is provided, filter for that file
        if (input.file_path) {
          lines = lines.filter((line: string) => line.includes(input.file_path));
          if (lines.length === 0) {
            return `No TypeScript errors found in ${input.file_path}.`;
          }
        }

        const formatted = lines.join("\n");
        return formatted.length > 10000 
          ? formatted.substring(0, 10000) + "\n...[TRUNCATED]" 
          : formatted;
      }
    } catch (e: any) {
      return `Error in LSP diagnostics: ${e.message}`;
    }
  }
};
