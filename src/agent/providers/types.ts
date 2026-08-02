import type { AgentLoopCallbacks } from "../callbacks";
import type { SessionContext } from "../context";

export type ProviderName = "gemini" | "claude" | "openai" | "ollama";

export interface ToolCallRequest {
  name: string;
  args: unknown;
  id?: string;
}

export interface ProviderRuntime {
  context: SessionContext;
  callbacks: AgentLoopCallbacks;
  handleToolUse: (call: ToolCallRequest) => Promise<string>;
  continueStep: () => Promise<void>;
}

export interface LlmProvider {
  readonly name: ProviderName;
  step(runtime: ProviderRuntime): Promise<void>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function messageText(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

export function normalizeToolArgs(args: unknown): unknown {
  if (typeof args !== "string") {
    return args ?? {};
  }
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}
