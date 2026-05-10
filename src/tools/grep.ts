import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import fg from "fast-glob";
import { ToolDefinition } from "./types";

const execFileAsync = promisify(execFile);

export const grepTool: ToolDefinition = {
  name: "grep_search",
  description: "Search for a pattern within files using ripgrep (or a JS fallback). Returns filepath:line_number:content.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "The search pattern (regex)" },
      path: { type: "string", description: "Directory or file to search in (relative to working dir)" },
      file_glob: { type: "string", description: "Optional glob to filter files (e.g. '*.ts')" }
    },
    required: ["pattern", "path"]
  },
  execute: async (input, context) => {
    try {
      const searchPath = path.resolve(context.workingDirectory, input.path);
      
      // Try ripgrep first
      try {
        const args = ["-n", input.pattern];
        if (input.file_glob) {
          args.push("-g", input.file_glob);
        }
        args.push(searchPath);

        const { stdout } = await execFileAsync("rg", args, { cwd: context.workingDirectory });
        if (stdout.trim().length === 0) return "No matches found.";
        
        // Truncate if too long (e.g., > 10000 chars)
        return stdout.length > 10000 ? stdout.substring(0, 10000) + "\n...[TRUNCATED]" : stdout;
      } catch (rgError: any) {
        // If rg returns code 1, it just means no matches. 
        if (rgError.code === 1) return "No matches found.";
        
        // Otherwise, rg is likely not installed (ENOENT), fall back to JS matcher
        return await jsGrepFallback(input.pattern, searchPath, input.file_glob, context.workingDirectory);
      }
    } catch (e: any) {
      return `Error in grep search: ${e.message}`;
    }
  }
};

async function jsGrepFallback(pattern: string, searchPath: string, fileGlob: string | undefined, cwd: string): Promise<string> {
  const isDir = fs.existsSync(searchPath) && fs.statSync(searchPath).isDirectory();
  
  let filesToSearch: string[] = [];
  if (!isDir) {
    filesToSearch = [searchPath];
  } else {
    // If it's a directory, use fast-glob
    const globPattern = fileGlob ? fileGlob : "**/*";
    filesToSearch = await fg(globPattern, { 
      cwd: searchPath, 
      absolute: true, 
      dot: true,
      ignore: ["**/node_modules/**", "**/.git/**"] 
    });
  }

  const regex = new RegExp(pattern, "g");
  let results: string[] = [];

  for (const file of filesToSearch) {
    try {
      // Very basic binary check (skip if it has null bytes early on)
      const buffer = fs.readFileSync(file);
      if (buffer.indexOf(0) !== -1) continue; 
      
      const content = buffer.toString("utf-8");
      const lines = content.split("\n");
      
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const relativePath = path.relative(cwd, file);
          results.push(`${relativePath}:${i + 1}:${lines[i]}`);
          // Reset regex state due to global flag
          regex.lastIndex = 0;
        }
      }
    } catch (err) {
      // Ignore read errors for individual files in fallback
    }
  }

  if (results.length === 0) return "No matches found.";
  
  const output = results.join("\n");
  return output.length > 10000 ? output.substring(0, 10000) + "\n...[TRUNCATED]" : output;
}
