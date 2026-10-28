/** Normalize messy model tool args into what our tools expect. */
export function normalizeToolInput(
  toolName: string,
  args: unknown,
): Record<string, unknown> {
  const base =
    args && typeof args === "object" && !Array.isArray(args)
      ? { ...(args as Record<string, unknown>) }
      : {};

  const pickString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = base[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
  };

  if (
    toolName === "read_file" ||
    toolName === "write_file" ||
    toolName === "edit_file"
  ) {
    const filePath = pickString(
      "file_path",
      "path",
      "filepath",
      "file",
      "filename",
      "target",
    );
    if (filePath) base.file_path = filePath;
  }

  if (toolName === "write_file") {
    const content = pickString("content", "contents", "text", "body", "data");
    if (content !== undefined) base.content = content;
  }

  if (toolName === "edit_file") {
    const oldStr = pickString(
      "old_str",
      "old_string",
      "oldString",
      "search",
      "find",
      "from",
    );
    const newStr = pickString(
      "new_str",
      "new_string",
      "newString",
      "replace",
      "to",
      "replacement",
    );
    if (oldStr !== undefined) base.old_str = oldStr;
    if (newStr !== undefined) base.new_str = newStr;
  }

  if (toolName === "bash" || toolName === "powershell") {
    const command = pickString("command", "cmd", "script", "code", "shell");
    if (command) base.command = command;
  }

  if (toolName === "grep_search") {
    const pattern = pickString("pattern", "query", "search", "regex", "text");
    if (pattern) base.pattern = pattern;
    if (base.path === undefined) {
      const searchPath = pickString("path", "dir", "directory", "cwd", "root");
      base.path = searchPath || ".";
    }
  }

  if (toolName === "glob_search") {
    const pattern = pickString(
      "pattern",
      "glob",
      "glob_pattern",
      "file_glob",
      "query",
    );
    if (pattern) base.pattern = pattern;
    const baseDir = pickString("base_dir", "path", "dir", "directory", "cwd");
    if (baseDir && base.base_dir === undefined) base.base_dir = baseDir;
  }

  if (toolName === "directory_tree") {
    if (base.path === undefined) {
      const treePath = pickString("path", "dir", "directory", "cwd");
      if (treePath) base.path = treePath;
    }
  }

  if (toolName === "todo_write" || toolName === "task_create") {
    if (base.status === undefined) base.status = "pending";
  }

  if (toolName === "lsp_diagnostics" && base.action === undefined) {
    base.action = "diagnostics";
  }

  return base;
}

export function missingRequiredArgs(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  const required: Record<string, string[]> = {
    read_file: ["file_path"],
    write_file: ["file_path", "content"],
    edit_file: ["file_path", "old_str", "new_str"],
    bash: ["command"],
    powershell: ["command"],
    grep_search: ["pattern"],
    glob_search: ["pattern"],
  };
  const keys = required[toolName];
  if (!keys) return null;
  const missing = keys.filter((key) => {
    const value = args[key];
    return value === undefined || value === null || value === "";
  });
  if (missing.length === 0) return null;
  return `Missing required args for ${toolName}: ${missing.join(", ")}. Retry the tool_call with those fields.`;
}
