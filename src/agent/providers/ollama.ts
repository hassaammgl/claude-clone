import { getToolDefinitions } from "../../tools/index";
import { loadSettings } from "../../config/settings";
import type { Message, OllamaToolCall } from "../messages";
import { isOllamaToolCall } from "../messages";
import { getSystemPrompt } from "../system-prompt";
import type { LlmProvider, ProviderRuntime } from "./types";
import {
  isRecord,
  messageText,
  normalizeToolArgs,
} from "./types";
import {
  buildPromptToolInstructions,
  formatPromptToolResult,
  parsePromptToolCalls,
} from "./prompt-tools";

export type OllamaToolMode = "auto" | "native" | "prompt";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  toolMode?: OllamaToolMode;
}

interface OllamaChatResponse {
  content: string;
  toolCalls: OllamaToolCall[];
  usedPromptTools: boolean;
}

type OllamaApiRole = "system" | "user" | "assistant" | "tool";

interface OllamaApiMessage {
  role: OllamaApiRole;
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

function resolveToolMode(config: OllamaConfig): OllamaToolMode {
  return (
    config.toolMode ||
    loadSettings().ollamaToolMode ||
    "auto"
  );
}

function toOllamaRole(role: Message["role"]): OllamaApiRole {
  if (role === "assistant" || role === "user" || role === "tool") {
    return role;
  }
  return "system";
}

function toNativeApiMessage(message: Message): OllamaApiMessage {
  const role = toOllamaRole(message.role);
  const apiMessage: OllamaApiMessage = {
    role,
    content: messageText(message.content),
  };
  if (role === "assistant" && message.tool_calls) {
    apiMessage.tool_calls = message.tool_calls;
  }
  if (role === "tool" && message.tool_name) {
    apiMessage.tool_name = message.tool_name;
  }
  return apiMessage;
}

function toPromptApiMessage(message: Message): OllamaApiMessage {
  if (message.role === "tool") {
    return {
      role: "user",
      content: formatPromptToolResult(
        message.tool_name || "unknown",
        messageText(message.content),
      ),
    };
  }
  const role =
    message.role === "assistant"
      ? "assistant"
      : message.role === "user"
        ? "user"
        : "system";
  return { role, content: messageText(message.content) };
}

function buildSystemContent(usePromptTools: boolean): string {
  const base = getSystemPrompt();
  if (!usePromptTools) return base;
  return `${base}\n\n${buildPromptToolInstructions()}`;
}

function buildOllamaMessages(
  contextMessages: Message[],
  usePromptTools: boolean,
): OllamaApiMessage[] {
  const mapper = usePromptTools ? toPromptApiMessage : toNativeApiMessage;
  return [
    { role: "system", content: buildSystemContent(usePromptTools) },
    ...contextMessages.map(mapper),
  ];
}

function ollamaToolsForApi() {
  return getToolDefinitions().map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

function parseOllamaChatResponse(data: unknown): {
  content: string;
  toolCalls: OllamaToolCall[];
} {
  if (!isRecord(data)) {
    throw new Error("Ollama returned invalid JSON.");
  }
  const assistantMsg = data.message;
  if (!isRecord(assistantMsg)) {
    throw new Error("Ollama returned an empty response.");
  }
  const content =
    typeof assistantMsg.content === "string" ? assistantMsg.content : "";
  const rawCalls = assistantMsg.tool_calls;
  const toolCalls = Array.isArray(rawCalls)
    ? rawCalls.filter(isOllamaToolCall)
    : [];
  return { content, toolCalls };
}

function mergeToolCalls(
  nativeCalls: OllamaToolCall[],
  content: string,
): { content: string; toolCalls: OllamaToolCall[]; usedPromptTools: boolean } {
  if (nativeCalls.length > 0) {
    return { content, toolCalls: nativeCalls, usedPromptTools: false };
  }
  const parsed = parsePromptToolCalls(content);
  return {
    content: parsed.displayText,
    toolCalls: parsed.toolCalls,
    usedPromptTools: parsed.toolCalls.length > 0,
  };
}

function pushAssistantMessage(
  runtime: ProviderRuntime,
  content: string,
  toolCalls: OllamaToolCall[],
): void {
  runtime.context.messages.push({
    role: "assistant",
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  });
  runtime.context.stats.messageCount = runtime.context.messages.length;
  runtime.callbacks.onContextUpdate?.(runtime.context);
  if (content) {
    runtime.callbacks.onStreamComplete?.(content);
  }
}

async function executeToolCalls(
  runtime: ProviderRuntime,
  toolCalls: OllamaToolCall[],
): Promise<void> {
  for (const call of toolCalls) {
    const toolResult = await runtime.handleToolUse({
      name: call.function.name,
      args: normalizeToolArgs(call.function.arguments),
    });
    runtime.context.messages.push({
      role: "tool",
      content: toolResult,
      tool_name: call.function.name,
    });
    runtime.context.stats.messageCount = runtime.context.messages.length;
    runtime.callbacks.onContextUpdate?.(runtime.context);
  }
  await runtime.continueStep();
}

function isToolsUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tool|function.?call|does not support|unsupported/i.test(message);
}

export class OllamaProvider implements LlmProvider {
  readonly name = "ollama" as const;
  private forcePromptTools = false;

  constructor(private readonly config: OllamaConfig) {}

  async step(runtime: ProviderRuntime): Promise<void> {
    const response = await this.requestChat(runtime.context.messages);
    if (!response.content && response.toolCalls.length === 0) {
      throw new Error("Ollama returned an empty response.");
    }
    pushAssistantMessage(runtime, response.content, response.toolCalls);
    if (response.toolCalls.length > 0) {
      await executeToolCalls(runtime, response.toolCalls);
      return;
    }
    runtime.callbacks.onWaitUserInput?.();
  }

  private shouldUsePromptTools(): boolean {
    const mode = resolveToolMode(this.config);
    return mode === "prompt" || this.forcePromptTools;
  }

  private shouldSendNativeTools(): boolean {
    const mode = resolveToolMode(this.config);
    if (mode === "prompt" || this.forcePromptTools) return false;
    return mode === "native" || mode === "auto";
  }

  private async requestChat(messages: Message[]): Promise<OllamaChatResponse> {
    const usePromptTools =
      this.shouldUsePromptTools() || resolveToolMode(this.config) === "auto";
    try {
      const data = await this.postChat(messages, {
        includeNativeTools: this.shouldSendNativeTools(),
        usePromptTools,
      });
      const parsed = parseOllamaChatResponse(data);
      return mergeToolCalls(parsed.toolCalls, parsed.content);
    } catch (error: unknown) {
      if (!this.shouldSendNativeTools() || !isToolsUnsupportedError(error)) {
        throw error;
      }
      this.forcePromptTools = true;
      const data = await this.postChat(messages, {
        includeNativeTools: false,
        usePromptTools: true,
      });
      const parsed = parseOllamaChatResponse(data);
      return mergeToolCalls([], parsed.content);
    }
  }

  private async postChat(
    messages: Message[],
    options: { includeNativeTools: boolean; usePromptTools: boolean },
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: buildOllamaMessages(messages, options.usePromptTools),
      stream: false,
    };
    if (options.includeNativeTools) {
      body.tools = ollamaToolsForApi();
    }
    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.apiKey
          ? { authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Ollama API error ${res.status} ${res.statusText}${errBody ? `: ${errBody}` : ""}`,
      );
    }
    return res.json();
  }
}
