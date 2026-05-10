import fs from "fs";
import path from "path";
import type { ToolDefinition } from "./types";

export const writeTool: ToolDefinition = {
  name: "write_file",
  description: "Creates a new file or overwrites an existing one with the given content.",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to file to write" },
      content: { type: "string", description: "The complete content to write" }
    },
    required: ["file_path", "content"]
  },
  execute: async (input, context) => {
    try {
      const fullPath = path.resolve(context.workingDirectory, input.file_path);
      const dir = path.dirname(fullPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, input.content, "utf-8");
      return `Successfully wrote to ${input.file_path}`;
    } catch (e: any) {
      return `Error writing file: ${e.message}`;
    }
  }
};
