import path from "path";
import fg from "fast-glob";
import { ToolDefinition } from "./types";

export const globTool: ToolDefinition = {
  name: "glob_search",
  description: "Find files using glob patterns. Returns array of matched file paths.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern (e.g., '**/*.ts', 'src/tools/*')" },
      base_dir: { type: "string", description: "Optional base directory to search from (relative to working dir)" }
    },
    required: ["pattern"]
  },
  execute: async (input, context) => {
    try {
      const cwd = input.base_dir 
        ? path.resolve(context.workingDirectory, input.base_dir)
        : context.workingDirectory;

      const entries = await fg(input.pattern, { cwd, dot: true, ignore: ["**/node_modules/**", "**/.git/**"] });
      
      if (entries.length === 0) {
        return `No files found matching pattern '${input.pattern}'`;
      }

      return `Found ${entries.length} files:\n${entries.join("\n")}`;
    } catch (e: any) {
      return `Error in glob search: ${e.message}`;
    }
  }
};
