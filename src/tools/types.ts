import type { Tool } from "@anthropic-ai/sdk/resources/messages.mjs";
import { SessionContext } from "../agent/context";

export interface ToolCallbacks {
  onAskUserQuestion?: (question: string, options: string[], resolve: (choice: string) => void) => void;
}

export interface ToolDefinition extends Tool {
  execute: (input: any, context: SessionContext, callbacks?: ToolCallbacks) => Promise<string>;
}
