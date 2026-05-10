import fs from "fs";
import path from "path";
import { ToolDefinition } from "./types";

export const readTool: ToolDefinition = {
  name: "read_file",
  description: "Read contents of a file from the local filesystem. Returns lines with 1-indexed numbers.",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to file to read" },
      start_line: { type: "number", description: "Optional start line (1-indexed)" },
      end_line: { type: "number", description: "Optional end line (1-indexed)" }
    },
    required: ["file_path"]
  },
  execute: async (input, context) => {
    try {
      const fullPath = path.resolve(context.workingDirectory, input.file_path);
      
      if (!fs.existsSync(fullPath)) {
        return `Error: File not found at ${fullPath}`;
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      let lines = content.split("\n");

      let start = input.start_line ? Math.max(1, input.start_line) : 1;
      let end = input.end_line ? Math.min(lines.length, input.end_line) : lines.length;

      // Ensure valid range
      if (start > end) {
        return `Error: start_line (${start}) is greater than end_line (${end})`;
      }

      let slicedLines = lines.slice(start - 1, end);
      
      const result = slicedLines
        .map((line, index) => `${start + index}: ${line}`)
        .join("\n");

      return `Read ${input.file_path} from line ${start} to ${end}:\n\n${result}`;
    } catch (e: any) {
      return `Error reading file: ${e.message}`;
    }
  }
};
