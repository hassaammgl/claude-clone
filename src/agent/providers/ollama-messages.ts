import type { Message } from "../messages";
import { getSystemPrompt } from "../system-prompt";
import type { OllamaToolCall } from "../messages";
import { messageText } from "./types";
import { buildPromptToolInstructions } from "./prompt-tools";
import fs from "fs";
import path from "path";

/** Messages that pollute the model context — keep in UI history, drop from API. */
export function isSyntheticSessionMessage(msg: Message): boolean {
  if (msg.role === "user" && typeof msg.content === "string") {
    return (
      msg.content === "__startup__" ||
      msg.content.startsWith("CONTEXT (CLAUDE.md)")
    );
  }
  if (msg.role === "assistant" && typeof msg.content === "string") {
    return (
      msg.content.includes("Welcome to Noni-chan") ||
      msg.content.includes("I have read CLAUDE.md")
    );
  }
  return false;
}

function readClaudeMdSnippet(maxChars = 6000): string {
  try {
    const claudeMdPath = path.join(process.cwd(), "CLAUDE.md");
    if (!fs.existsSync(claudeMdPath)) return "";
    const raw = fs.readFileSync(claudeMdPath, "utf-8").trim();
    if (!raw) return "";
    return raw.length > maxChars
      ? `${raw.slice(0, maxChars)}\n…[truncated]`
      : raw;
  } catch {
    return "";
  }
}

export function buildOllamaSystemPrompt(usePromptTools: boolean): string {
  let base = getSystemPrompt();
  const project = readClaudeMdSnippet();
  if (project) {
    base += `\n\nProject instructions (CLAUDE.md):\n${project}`;
  }
  if (usePromptTools) {
    base += `\n\n${buildPromptToolInstructions()}`;
  }
  return base;
}

/** Rebuild prompt-mode assistant content so tool calls stay visible to the model. */
export function serializePromptAssistant(msg: Message): string {
  const parts: string[] = [];
  const text =
    typeof msg.content === "string"
      ? msg.content.trim()
      : messageText(msg.content).trim();
  if (text) parts.push(text);

  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    for (const call of msg.tool_calls) {
      const payload = {
        name: call.function.name,
        arguments: call.function.arguments ?? {},
      };
      parts.push(`<tool_call>\n${JSON.stringify(payload)}\n</tool_call>`);
    }
  }
  return parts.join("\n\n");
}

export function toolCallsFromAssistant(msg: Message): OllamaToolCall[] {
  return Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
}
