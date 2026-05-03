import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages.mjs";
import { createContext } from "../agent/context";
import { allTools, findTool } from "./index";
import { ToolDefinition } from "./types";

// ─── spawn_agent ────────────────────────────────────────────────────────────

export const spawnAgentTool: ToolDefinition = {
  name: "spawn_agent",
  description: "Spawn a sub-agent with its own isolated context to handle a specific sub-task. The sub-agent runs to completion and returns its final response.",
  input_schema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The task prompt for the sub-agent" },
      tools: {
        type: "array",
        items: { type: "string" },
        description: "Optional list of tool names to give the sub-agent (defaults to read-only tools if not specified)"
      }
    },
    required: ["prompt"]
  },
  execute: async (input, context) => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

    // Choose which tools to give sub-agent
    const allowedToolNames: string[] = input.tools && input.tools.length > 0
      ? input.tools
      : ["read_file", "glob_search", "grep_search", "directory_tree", "lsp_diagnostics", "web_search", "fetch_url"];

    const subTools = allTools
      .filter(t => allowedToolNames.includes(t.name))
      .map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema
      })) as Tool[];

    // Create a fresh sub-context inheriting the working directory
    const subContext = createContext(input.prompt);
    subContext.workingDirectory = context.workingDirectory;

    const subMessages = [...subContext.messages];
    let finalResponse = "";

    // Run the sub-agent loop until completion
    let iterationsLeft = 10; // Safety cap to prevent infinite loops
    while (iterationsLeft-- > 0) {
      const response = await client.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 4096,
        system: "You are a sub-agent. Complete the given task efficiently and return a concise result. Do not ask clarifying questions — use your best judgment.",
        messages: subMessages,
        tools: subTools.length > 0 ? subTools : undefined,
      });

      // Collect any text output
      for (const block of response.content) {
        if (block.type === "text") {
          finalResponse = block.text;
        }
      }

      subMessages.push({ role: "assistant", content: response.content });

      // If no more tools needed, we're done
      if (response.stop_reason !== "tool_use") break;

      // Execute tool calls
      const toolResults: any[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const tool = findTool(block.name);
        let result = "";
        if (tool) {
          try {
            result = await tool.execute(block.input, subContext);
          } catch (e: any) {
            result = `Tool error: ${e.message}`;
          }
        } else {
          result = `Unknown tool: ${block.name}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result
        });
      }

      subMessages.push({ role: "user", content: toolResults });
    }

    if (!finalResponse) {
      finalResponse = "Sub-agent completed but produced no text output.";
    }

    return `[Sub-Agent Result]\n${finalResponse}`;
  }
};

// ─── ask_user_question ───────────────────────────────────────────────────────

// This tool resolves via the UI callback — the actual logic lives in App.tsx.
// We use a module-level callback registry so the tool can talk to the UI.
type QuestionResolver = (choice: string) => void;
let _pendingQuestionResolver: QuestionResolver | null = null;

export function registerQuestionCallback(resolver: QuestionResolver) {
  _pendingQuestionResolver = resolver;
}

export const askUserQuestionTool: ToolDefinition = {
  name: "ask_user_question",
  description: "Ask the user a clarifying question with a list of choices. Waits for their selection before continuing.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask the user" },
      options: {
        type: "array",
        items: { type: "string" },
        description: "List of answer choices to present to the user"
      }
    },
    required: ["question", "options"]
  },
  execute: async (input, _, callbacks) => {
    if (!callbacks?.onAskUserQuestion) {
      return `User was asked: "${input.question}"\nOptions: ${input.options.join(", ")}\n(No UI available to answer — defaulting to first option: ${input.options[0]})`;
    }

    return new Promise<string>((resolve) => {
      callbacks.onAskUserQuestion!(input.question, input.options, resolve);
    });
  }
};
