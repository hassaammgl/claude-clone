import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs";

export interface TokenUsage {
  input: number;
  output: number;
}

export interface OllamaToolCall {
  type?: string;
  function: {
    name: string;
    arguments?: unknown;
  };
}

/** Session message supporting Anthropic, Gemini, OpenAI, and Ollama tool shapes. */
export interface Message {
  role: "user" | "assistant" | "tool" | "system" | "error";
  content: string | ContentBlockParam[];
  usage?: TokenUsage;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export function isOllamaToolCall(value: unknown): value is OllamaToolCall {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const fn = (value as { function?: unknown }).function;
  if (typeof fn !== "object" || fn === null) {
    return false;
  }
  return typeof (fn as { name?: unknown }).name === "string";
}
