import fs from "fs";
import path from "path";
import { ToolDefinition } from "./types";

export const editTool: ToolDefinition = {
  name: "edit_file",
  description: "Replace an exact string in a file with a new string. Use this for targeted edits.",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to file to edit" },
      old_str: { type: "string", description: "The exact string to be replaced" },
      new_str: { type: "string", description: "The string to replace with" }
    },
    required: ["file_path", "old_str", "new_str"]
  },
  execute: async (input, context) => {
    try {
      const fullPath = path.resolve(context.workingDirectory, input.file_path);
      
      if (!fs.existsSync(fullPath)) {
        return `Error: File not found at ${fullPath}`;
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      
      const occurrences = content.split(input.old_str).length - 1;
      
      if (occurrences === 0) {
        return `Error: old_str not found in file. Make sure whitespace and indentation match exactly.`;
      }
      
      if (occurrences > 1) {
        return `Error: old_str found ${occurrences} times. Edit target must be unique.`;
      }

      const newContent = content.replace(input.old_str, input.new_str);
      fs.writeFileSync(fullPath, newContent, "utf-8");
      
      return `Successfully updated ${input.file_path}`;
    } catch (e: any) {
      return `Error editing file: ${e.message}`;
    }
  }
};
