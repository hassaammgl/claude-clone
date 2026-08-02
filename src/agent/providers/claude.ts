import Anthropic from "@anthropic-ai/sdk";
import { getToolDefinitions } from "../../tools/index";
import { getSystemPrompt } from "../system-prompt";
import type { LlmProvider, ProviderRuntime, ToolCallRequest } from "./types";

const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";
const CLAUDE_MAX_TOKENS = 4096;
const CLAUDE_SUMMARY_MAX_TOKENS = 1024;

interface ClaudeToolCall extends ToolCallRequest {
  id: string;
}

function buildClaudeMessages(runtime: ProviderRuntime) {
  return runtime.context.messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
}

function claudeTools() {
  return getToolDefinitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

function extractClaudeParts(response: Anthropic.Message): {
  text: string;
  toolCalls: ClaudeToolCall[];
} {
  let text = "";
  const toolCalls: ClaudeToolCall[] = [];
  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({ name: block.name, args: block.input, id: block.id });
    }
  }
  return { text, toolCalls };
}

function recordClaudeUsage(
  runtime: ProviderRuntime,
  usage: Anthropic.Usage | undefined,
): void {
  if (!usage) return;
  runtime.context.stats.totalTokens.input += usage.input_tokens || 0;
  runtime.context.stats.totalTokens.output += usage.output_tokens || 0;
}

function pushClaudeAssistantText(
  runtime: ProviderRuntime,
  text: string,
  usage: Anthropic.Usage | undefined,
): void {
  runtime.context.messages.push({
    role: "assistant",
    content: text,
    usage: usage
      ? { input: usage.input_tokens, output: usage.output_tokens }
      : undefined,
  });
  runtime.context.stats.messageCount = runtime.context.messages.length;
  runtime.callbacks.onContextUpdate?.(runtime.context);
  runtime.callbacks.onStreamComplete?.(text);
}

async function applyClaudeToolCalls(
  runtime: ProviderRuntime,
  toolCalls: ClaudeToolCall[],
): Promise<void> {
  for (const call of toolCalls) {
    const toolResult = await runtime.handleToolUse(call);
    runtime.context.messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: call.id,
          content: toolResult,
        },
      ],
    });
    runtime.context.stats.messageCount = runtime.context.messages.length;
    runtime.callbacks.onContextUpdate?.(runtime.context);
  }
  await runtime.continueStep();
}

export class ClaudeProvider implements LlmProvider {
  readonly name = "claude" as const;

  constructor(private readonly client: Anthropic) {}

  async step(runtime: ProviderRuntime): Promise<void> {
    const response = await this.client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: getSystemPrompt(),
      messages: buildClaudeMessages(runtime),
      tools: claudeTools() as Anthropic.Messages.Tool[],
    });
    recordClaudeUsage(runtime, response.usage);
    const { text, toolCalls } = extractClaudeParts(response);
    if (text) {
      pushClaudeAssistantText(runtime, text, response.usage);
    }
    if (toolCalls.length > 0) {
      await applyClaudeToolCalls(runtime, toolCalls);
      return;
    }
    runtime.callbacks.onWaitUserInput?.();
  }

  async summarize(historyJson: string): Promise<string> {
    const response = await this.client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_SUMMARY_MAX_TOKENS,
      messages: [
        { role: "user", content: `Summarize this history: ${historyJson}` },
      ],
    });
    const first = response.content[0];
    return first && first.type === "text" ? first.text : "";
  }
}
