import path from "path";
// @ts-ignore
import { tree } from "tree-node-cli";
import type { ToolDefinition } from "./types";

export const treeTool: ToolDefinition = {
  name: "directory_tree",
  description: "Get a visual ASCII tree representation of a directory structure to understand the workspace layout.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Optional relative path to evaluate (defaults to root)" },
      depth: { type: "number", description: "Maximum depth to traverse (defaults to 3)" }
    }
  },
  execute: async (input, context) => {
    try {
      const targetPath = input.path 
        ? path.resolve(context.workingDirectory, input.path) 
        : context.workingDirectory;
      
      const depth = input.depth || 3;

      const output = tree(targetPath, {
        allFiles: true,
        maxDepth: depth,
        exclude: [
          /node_modules/,
          /\.git/,
          /\.next/,
          /dist/,
          /build/,
          /coverage/
        ]
      });

      return `Directory Tree for ${targetPath} (Depth: ${depth}):\n\n${output}`;
    } catch (e: any) {
      return `Error generating directory tree: ${e.message}`;
    }
  }
};
