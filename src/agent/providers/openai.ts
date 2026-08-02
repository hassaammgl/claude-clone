import { getSystemPrompt } from "../system-prompt";
import type { LlmProvider, ProviderRuntime } from "./types";
import { isRecord, messageText } from "./types";

export interface OpenAIConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

function buildOpenAIMessages(runtime: ProviderRuntime) {
  return [
    { role: "system", content: getSystemPrompt() },
    ...runtime.context.messages
      .filter((m) => m.role === "assistant" || m.role === "user")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: messageText(m.content),
      })),
  ];
}

function extractOpenAIContent(data: unknown): string {
  if (!isRecord(data)) {
    throw new Error("OpenAI returned invalid JSON.");
  }
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("OpenAI returned an empty response.");
  }
  const first = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    throw new Error("OpenAI returned an empty response.");
  }
  const content = first.message.content;
  if (typeof content !== "string" || !content) {
    throw new Error("OpenAI returned an empty response.");
  }
  return content;
}

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai" as const;

  constructor(private readonly config: OpenAIConfig) {}

  async step(runtime: ProviderRuntime): Promise<void> {
    const text = await this.requestCompletion(runtime);
    runtime.context.messages.push({ role: "assistant", content: text });
    runtime.context.stats.messageCount = runtime.context.messages.length;
    runtime.callbacks.onContextUpdate?.(runtime.context);
    runtime.callbacks.onStreamComplete?.(text);
    runtime.callbacks.onWaitUserInput?.();
  }

  private async requestCompletion(runtime: ProviderRuntime): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: buildOpenAIMessages(runtime),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `OpenAI API error ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`,
      );
    }
    return extractOpenAIContent(await res.json());
  }
}
