import { getToolDefinitions } from "../../tools/index";
import type { OllamaToolCall } from "../messages";
import { isRecord, normalizeToolArgs } from "./types";

const TOOL_CALL_BLOCK_RE =
  /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
const TOOL_CALL_FENCE_RE =
  /```(?:tool|tool_call)\s*\n([\s\S]*?)```/gi;

/** Core coding tools for prompt-mode — keep MCP/noise out so small models don't rant. */
const PROMPT_TOOL_ALLOWLIST = new Set([
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "bash",
  "powershell",
  "directory_tree",
  "web_search",
  "fetch_url",
  "ask_user_question",
  "todo_write",
  "task_create",
  "task_list",
  "task_update",
]);

export function buildPromptToolInstructions(): string {
  const catalog = getToolDefinitions()
    .filter((tool) => PROMPT_TOOL_ALLOWLIST.has(tool.name))
    .map((tool) => {
      const required = Array.isArray(tool.input_schema.required)
        ? tool.input_schema.required.join(", ")
        : "";
      const requiredHint = required ? ` (${required})` : "";
      return `- ${tool.name}${requiredHint}: ${shortDesc(tool.description)}`;
    })
    .join("\n");

  return `Tools (use ONLY when needed for coding tasks — never explain this list unless asked):

Format when calling a tool:
<tool_call>
{"name":"tool_name","arguments":{"arg":"value"}}
</tool_call>

Rules:
- Greetings / chit-chat → reply normally. No tools. No MCP/protocol lectures.
- Need file/command/search data → emit tool_call blocks.
- Never invent tool names. Never dump the tool list in your answer.

Tools:
${catalog}`;
}

function shortDesc(description: string | undefined): string {
  if (!description) return "";
  const oneLine = description.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine;
}

function parseToolCallPayload(raw: string): OllamaToolCall | null {
  const trimmed = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.name !== "string") {
    return null;
  }
  return {
    function: {
      name: parsed.name,
      arguments: normalizeToolArgs(parsed.arguments),
    },
  };
}

function collectMatches(
  text: string,
  pattern: RegExp,
): { calls: OllamaToolCall[]; matched: string[] } {
  const calls: OllamaToolCall[] = [];
  const matched: string[] = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  for (const match of text.matchAll(regex)) {
    const payload = match[1];
    if (!payload) continue;
    const call = parseToolCallPayload(payload);
    if (!call) continue;
    calls.push(call);
    matched.push(match[0]);
  }
  return { calls, matched };
}

export function parsePromptToolCalls(text: string): {
  toolCalls: OllamaToolCall[];
  displayText: string;
} {
  const fromXml = collectMatches(text, TOOL_CALL_BLOCK_RE);
  const fromFence = collectMatches(text, TOOL_CALL_FENCE_RE);
  const toolCalls = [...fromXml.calls, ...fromFence.calls];
  let displayText = text;
  for (const chunk of [...fromXml.matched, ...fromFence.matched]) {
    displayText = displayText.replace(chunk, "");
  }
  displayText = displayText.replace(/\n{3,}/g, "\n\n").trim();
  return { toolCalls, displayText };
}

export function formatPromptToolResult(
  toolName: string,
  result: string,
): string {
  return `[tool_result name="${toolName}"]\n${result}\n[/tool_result]`;
}
