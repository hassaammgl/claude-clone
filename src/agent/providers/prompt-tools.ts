import { getToolDefinitions } from "../../tools/index";
import type { OllamaToolCall } from "../messages";
import { isRecord, normalizeToolArgs } from "./types";

const TOOL_CALL_BLOCK_RE =
  /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
const TOOL_CALL_FENCE_RE =
  /```(?:tool|tool_call|json)\s*\n([\s\S]*?)```/gi;

/**
 * Extract balanced JSON objects that look like tool calls (handles nested braces).
 */
function extractBareToolJsonObjects(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const slice = text.slice(i, j + 1);
          if (
            /"name"\s*:/.test(slice) &&
            /"(?:arguments|parameters|args)"\s*:/.test(slice)
          ) {
            out.push(slice);
          }
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Core coding tools for prompt/native Ollama — keep MCP/noise out.
 * Names must match `src/tools/*.ts` exactly.
 */
export const CORE_TOOL_NAMES = new Set([
  "read_file",
  "write_file",
  "edit_file",
  "glob_search",
  "grep_search",
  "bash",
  "powershell",
  "directory_tree",
  "web_search",
  "fetch_url",
  "todo_write",
  "task_create",
  "task_list",
  "task_update",
  "task_get",
  "lsp_diagnostics",
]);

export function getCoreToolDefinitions() {
  return getToolDefinitions().filter((tool) => CORE_TOOL_NAMES.has(tool.name));
}

export function buildPromptToolInstructions(): string {
  const catalog = getCoreToolDefinitions()
    .map((tool) => {
      const required = Array.isArray(tool.input_schema.required)
        ? tool.input_schema.required.join(", ")
        : "";
      const requiredHint = required ? ` (${required})` : "";
      return `- ${tool.name}${requiredHint}: ${shortDesc(tool.description)}`;
    })
    .join("\n");

  return `You have tools. The runtime EXECUTES <tool_call> blocks for you.

OUTPUT FORMAT (mandatory when you need data):
<tool_call>
{"name":"TOOL_NAME","arguments":{...}}
</tool_call>

You may emit multiple blocks. Put almost NOTHING else in that turn — no essays.

EXAMPLES (copy this pattern):

User: Read package.json
<tool_call>
{"name":"read_file","arguments":{"file_path":"package.json"}}
</tool_call>

User: What's in src/agent?
<tool_call>
{"name":"directory_tree","arguments":{"path":"src/agent","depth":2}}
</tool_call>

User: Run ls src
<tool_call>
{"name":"bash","arguments":{"command":"ls src"}}
</tool_call>

FORBIDDEN:
- Saying "I will use read_file…" / "I can call a tool…" / explaining MCP / listing tools
- Inventing file contents instead of calling read_file
- Using fake names like read, write, edit (use read_file, write_file, edit_file)

After you receive [tool_result]:
- If the user's task still needs work → emit more <tool_call> blocks immediately.
- If the task is fully done → short final summary only.
- Do NOT ask the user to continue. Do NOT stop after a single tool on multi-step work.

Available tools:
${catalog}`;
}

/** Injected on retry when the model lectures instead of calling tools. */
export const TOOL_FORCE_NUDGE = `STOP. Do not explain tools. Do not say what you will do.
Emit ONLY one or more <tool_call> blocks for the user's last request. Nothing else.`;

export function userMessageNeedsTools(text: string): boolean {
  const t = text.trim();
  if (!t || t.startsWith("/")) return false;
  if (/^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool)\b/i.test(t) && t.length < 40) {
    return false;
  }
  return /\b(read|open|show|list|ls|cat|run|exec|bash|grep|search|find|glob|edit|write|create|fix|implement|refactor|build|update|check|look|inspect|contents?|file|folder|director(y|ies)|package\.json|tsconfig|src\/|what('?s| is) in)\b/i.test(
    t,
  );
}

export function assistantLecturedAboutTools(text: string): boolean {
  if (!text.trim()) return false;
  if (/<tool_call>/i.test(text)) return false;
  return /\b(I (can|will|could|would|am going to) (use|call|invoke|run)|using the .+ tool|available tools?|tool(s)? (I have|available|you can)|MCP|function call|tool_call|here'?s how|let me (use|call|explain)|I don'?t have (direct )?access)\b/i.test(
    text,
  );
}

function shortDesc(description: string | undefined): string {
  if (!description) return "";
  const oneLine = description.replace(/\s+/g, " ").trim();
  return oneLine.length > 72 ? `${oneLine.slice(0, 69)}…` : oneLine;
}

function parseToolCallPayload(raw: string): OllamaToolCall | null {
  const trimmed = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  if (isRecord(parsed.function) && typeof parsed.function.name === "string") {
    return {
      function: {
        name: parsed.function.name,
        arguments: normalizeToolArgs(
          parsed.function.arguments ?? parsed.function.parameters,
        ),
      },
    };
  }

  if (typeof parsed.name !== "string") return null;

  const args =
    parsed.arguments ?? parsed.parameters ?? parsed.args ?? parsed.input ?? {};

  return {
    function: {
      name: parsed.name,
      arguments: normalizeToolArgs(args),
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
    const payload = match[1] ?? match[0];
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
  let toolCalls = [...fromXml.calls, ...fromFence.calls];
  let displayText = text;
  for (const chunk of [...fromXml.matched, ...fromFence.matched]) {
    displayText = displayText.replace(chunk, "");
  }

  if (toolCalls.length === 0) {
    const bareChunks = extractBareToolJsonObjects(text);
    for (const chunk of bareChunks) {
      const call = parseToolCallPayload(chunk);
      if (!call) continue;
      toolCalls.push(call);
      displayText = displayText.replace(chunk, "");
    }
  }

  displayText = displayText.replace(/\n{3,}/g, "\n\n").trim();
  return { toolCalls, displayText };
}

export function formatPromptToolResult(
  toolName: string,
  result: string,
): string {
  const clipped =
    result.length > 12_000 ? `${result.slice(0, 12_000)}\n…[truncated]` : result;
  return `[tool_result name="${toolName}"]\n${clipped}\n[/tool_result]\n\nContinue the user's task: more <tool_call> blocks if needed, otherwise a short final summary. Do not ask the user what to do next.`;
}
