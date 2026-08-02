import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type FunctionDeclarationsTool,
} from "@google/generative-ai";
import { getToolDefinitions } from "../../tools/index";
import { getSystemPrompt } from "../system-prompt";
import type { LlmProvider, ProviderRuntime } from "./types";
import { messageText } from "./types";

const GEMINI_MODEL = "gemini-3-flash-preview";

function geminiTools(): FunctionDeclarationsTool[] {
  // Anthropic Tool.InputSchema uses string "object"; Gemini expects SchemaType enum.
  return [
    {
      functionDeclarations: getToolDefinitions().map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      })),
    },
  ] as FunctionDeclarationsTool[];
}

export function createGeminiModel(apiKey: string): GenerativeModel {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: geminiTools(),
  });
}

function buildGeminiHistory(runtime: ProviderRuntime) {
  return runtime.context.messages.slice(0, -1).map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: messageText(msg.content) }],
  }));
}

function recordGeminiUsage(
  runtime: ProviderRuntime,
  usage:
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      }
    | undefined,
): void {
  if (!usage) return;
  runtime.context.stats.totalTokens.input += usage.promptTokenCount || 0;
  runtime.context.stats.totalTokens.output += usage.candidatesTokenCount || 0;
}

function pushGeminiAssistantText(
  runtime: ProviderRuntime,
  text: string,
  usage:
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      }
    | undefined,
): void {
  runtime.context.messages.push({
    role: "assistant",
    content: text,
    usage: usage
      ? {
          input: usage.promptTokenCount || 0,
          output: usage.candidatesTokenCount || 0,
        }
      : undefined,
  });
  runtime.context.stats.messageCount = runtime.context.messages.length;
  runtime.callbacks.onContextUpdate?.(runtime.context);
  runtime.callbacks.onStreamComplete?.(text);
}

async function applyGeminiToolCalls(
  runtime: ProviderRuntime,
  calls: Array<{ name: string; args: object }>,
): Promise<void> {
  for (const call of calls) {
    const toolResult = await runtime.handleToolUse({
      name: call.name,
      args: call.args,
    });
    runtime.context.messages.push({
      role: "user",
      content: `Tool ${call.name} result: ${toolResult}`,
    });
    runtime.context.stats.messageCount = runtime.context.messages.length;
    runtime.callbacks.onContextUpdate?.(runtime.context);
  }
  await runtime.continueStep();
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini" as const;

  constructor(private readonly model: GenerativeModel) {}

  async step(runtime: ProviderRuntime): Promise<void> {
    const lastMessage =
      runtime.context.messages[runtime.context.messages.length - 1];
    if (!lastMessage) return;

    const chat = this.model.startChat({
      history: buildGeminiHistory(runtime),
      systemInstruction: getSystemPrompt(),
    });
    const result = await chat.sendMessage(messageText(lastMessage.content));
    const response = result.response;
    recordGeminiUsage(runtime, response.usageMetadata);

    const text = response.text();
    if (text) {
      pushGeminiAssistantText(runtime, text, response.usageMetadata);
    }

    const calls = response.functionCalls();
    if (calls && calls.length > 0) {
      await applyGeminiToolCalls(runtime, calls);
      return;
    }
    runtime.callbacks.onWaitUserInput?.();
  }

  async summarize(historyJson: string): Promise<string> {
    const chat = this.model.startChat({ history: [] });
    const result = await chat.sendMessage(
      `Summarize this history: ${historyJson}`,
    );
    return result.response.text();
  }
}
