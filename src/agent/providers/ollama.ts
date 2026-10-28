import { getCoreToolDefinitions } from "./prompt-tools";
import { loadSettings } from "../../config/settings";
import type { Message, OllamaToolCall } from "../messages";
import { isOllamaToolCall } from "../messages";
import type { LlmProvider, ProviderRuntime } from "./types";
import {
  isRecord,
  messageText,
  normalizeToolArgs,
} from "./types";
import {
  formatPromptToolResult,
  parsePromptToolCalls,
  TOOL_FORCE_NUDGE,
  userMessageNeedsTools,
  assistantLecturedAboutTools,
} from "./prompt-tools";
import {
  CONTINUE_NUDGE,
  findUserGoal,
  recentToolActivity,
  shouldContinueAutonomously,
} from "./autonomy";
import {
  buildOllamaSystemPrompt,
  isSyntheticSessionMessage,
  serializePromptAssistant,
} from "./ollama-messages";

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
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: serializePromptAssistant(message),
    };
  }
  const role = message.role === "user" ? "user" : "system";
  return { role, content: messageText(message.content) };
}

function buildOllamaMessages(
  contextMessages: Message[],
  usePromptTools: boolean,
): OllamaApiMessage[] {
  const mapper = usePromptTools ? toPromptApiMessage : toNativeApiMessage;
  const filtered = contextMessages.filter((m) => !isSyntheticSessionMessage(m));
  return [
    { role: "system", content: buildOllamaSystemPrompt(usePromptTools) },
    ...filtered.map(mapper),
  ];
}

function ollamaToolsForApi() {
  return getCoreToolDefinitions().map((tool) => ({
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

function lastUserText(messages: Message[]): string {
  return findUserGoal(messages);
}

export class OllamaProvider implements LlmProvider {
  readonly name = "ollama" as const;
  private forcePromptTools = false;
  /** Ephemeral continue/force nudge — not written into chat history. */
  private pendingNudge: string | null = null;

  constructor(private readonly config: OllamaConfig) {}

  async step(runtime: ProviderRuntime): Promise<void> {
    const requestMessages = this.pendingNudge
      ? [
          ...runtime.context.messages,
          { role: "user" as const, content: this.pendingNudge },
        ]
      : runtime.context.messages;
    this.pendingNudge = null;

    let response = await this.requestChat(requestMessages);
    const goal = findUserGoal(runtime.context.messages);
    const alreadyUsedTools = recentToolActivity(runtime.context.messages);

    // Only force a tool call on the first attempt — not after tools already ran.
    if (
      response.toolCalls.length === 0 &&
      !alreadyUsedTools &&
      (userMessageNeedsTools(goal) ||
        assistantLecturedAboutTools(response.content))
    ) {
      const retry = await this.requestChat([
        ...runtime.context.messages,
        { role: "user", content: TOOL_FORCE_NUDGE },
      ]);
      if (retry.toolCalls.length > 0) {
        response = retry;
      } else if (retry.content.trim()) {
        response = retry;
      }
    }

    if (!response.content && response.toolCalls.length === 0) {
      throw new Error("Ollama returned an empty response.");
    }
    pushAssistantMessage(runtime, response.content, response.toolCalls);
    if (response.toolCalls.length > 0) {
      await executeToolCalls(runtime, response.toolCalls);
      return;
    }

    // Multi-step autonomy: don't wait for the user if the task still looks open.
    if (
      shouldContinueAutonomously({
        goal,
        assistantText: response.content,
        messages: runtime.context.messages,
        turn: runtime.turn,
        maxTurns: runtime.maxTurns,
      })
    ) {
      this.pendingNudge = CONTINUE_NUDGE;
      await runtime.continueStep();
      return;
    }

    runtime.callbacks.onWaitUserInput?.();
  }

  private shouldUsePromptTools(): boolean {
    const mode = resolveToolMode(this.config);
    // auto → prompt-style text tools (most reliable for local/small models)
    return mode === "prompt" || mode === "auto" || this.forcePromptTools;
  }

  private shouldSendNativeTools(): boolean {
    const mode = resolveToolMode(this.config);
    // Native API tools only when explicitly requested — mixing with prompt confuses models.
    if (this.forcePromptTools) return false;
    return mode === "native";
  }

  private async requestChat(messages: Message[]): Promise<OllamaChatResponse> {
    const usePromptTools = this.shouldUsePromptTools();
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
