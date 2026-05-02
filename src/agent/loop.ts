import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { SessionContext } from "./context";
import { PermissionEngine, PermissionChoice } from "../permissions/engine";
import { getToolDefinitions, findTool } from "../tools/index";

export interface AgentLoopCallbacks {
  onStreamContent?: (text: string) => void;
  onStreamComplete?: (fullText: string) => void;
  onWaitUserInput?: () => void;
  onAskPermission?: (
    toolName: string,
    input: any,
    resolve: (choice: PermissionChoice) => void,
  ) => void;
  onAskUserQuestion?: (
    question: string,
    options: string[],
    resolve: (choice: string) => void,
  ) => void;
  onError?: (error: Error) => void;
}

export class AgentLoop {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private context: SessionContext;
  private callbacks: AgentLoopCallbacks;
  private permissionEngine: PermissionEngine;

  constructor(context: SessionContext, callbacks: AgentLoopCallbacks) {
    this.context = context;
    this.callbacks = callbacks;
    this.permissionEngine = new PermissionEngine();
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    this.genAI = new GoogleGenerativeAI(apiKey);

    const tools = [
      {
        functionDeclarations: getToolDefinitions().map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        })),
      },
    ];

    this.model = this.genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      tools: tools as any,
    });
  }

  public getContext() {
    return this.context;
  }

  public async start() {
    if (this.context.messages.length === 0) {
      this.callbacks.onWaitUserInput?.();
      return;
    }
    await this.step();
  }

  public async submitUserMessage(content: string) {
    if (content.startsWith("/")) {
      const handled = await this.handleSlashCommand(content);
      if (handled) return;
    }
    this.context.messages.push({ role: "user", content });
    await this.step();
  }

  private async handleSlashCommand(command: string): Promise<boolean> {
    const [cmd, ...args] = command.split(" ");

    switch (cmd) {
      case "/help":
        this.context.messages.push({
          role: "model",
          content:
            "Available commands:\n- /help: Show this help\n- /clear: Clear conversation history\n- /permissions: Show permission status\n- /mcp: List MCP servers/tools\n- /settings: Show settings",
        });
        this.callbacks.onWaitUserInput?.();
        return true;
      case "/clear":
        this.context.messages = [];
        this.callbacks.onWaitUserInput?.();
        return true;
      case "/permissions":
        this.context.messages.push({
          role: "model",
          content:
            "Permission Engine Status: Active\nAlways Allowed: " +
            JSON.stringify([...this.permissionEngine.getAlwaysAllowed()]),
        });
        this.callbacks.onWaitUserInput?.();
        return true;
      case "/mcp":
        const mcpStatus = await this.context.mcpManager.listAllTools();
        this.context.messages.push({
          role: "model",
          content:
            "Connected MCP Servers: " +
            mcpStatus.map((s) => s.serverName).join(", "),
        });
        this.callbacks.onWaitUserInput?.();
        return true;
      case "/settings":
        this.context.messages.push({
          role: "model",
          content:
            "Current Settings:\nWorkingDirectory: " +
            this.context.workingDirectory,
        });
        this.callbacks.onWaitUserInput?.();
        return true;
    }
    return false;
  }

  private async compactConversation() {
    // Basic summary logic for Gemini
    const chat = this.model.startChat({ history: [] });
    const result = await chat.sendMessage(
      `Summarize this history: ${JSON.stringify(this.context.messages.slice(0, 20))}`,
    );
    const summaryText = result.response.text();

    this.context.messages = [
      { role: "user", content: `SUMMARY: ${summaryText}` },
      { role: "model", content: "I have the summary." },
      ...this.context.messages.slice(20),
    ];
  }

  private async step() {
    try {
      if (this.context.messages.length > 40) {
        await this.compactConversation();
      }

      // Map context messages to Gemini History
      const history = this.context.messages.slice(0, -1).map((msg) => ({
        role:
          msg.role === "assistant" || msg.role === "model" ? "model" : "user",
        parts: [
          {
            text:
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
          },
        ],
      }));

      const lastMessage =
        this.context.messages[this.context.messages.length - 1];
      const chat = this.model.startChat({ history });

      const result = await chat.sendMessage(
        typeof lastMessage.content === "string"
          ? lastMessage.content
          : JSON.stringify(lastMessage.content),
      );

      const response = result.response;
      const text = response.text();

      if (text) {
        this.callbacks.onStreamComplete?.(text);
        this.context.messages.push({ role: "model", content: text });
      }

      const calls = response.functionCalls();
      if (calls && calls.length > 0) {
        for (const call of calls) {
          const toolResult = await this.handleToolUse(call);
          // For Gemini, we usually send the function response back
          // We'll add it to messages and step again
          this.context.messages.push({
            role: "user",
            content: `Tool ${call.name} result: ${toolResult}`,
          });
        }
        await this.step();
      } else {
        this.callbacks.onWaitUserInput?.();
      }
    } catch (error: any) {
      this.callbacks.onError?.(error);
    }
  }

  private async handleToolUse(call: any) {
    const permission = this.permissionEngine.checkPermission(
      call.name,
      this.context,
    );
    let decision: PermissionChoice = "allow_once";

    if (permission === "ask") {
      decision = await new Promise<PermissionChoice>((resolve) => {
        if (this.callbacks.onAskPermission) {
          this.callbacks.onAskPermission(call.name, call.args, resolve);
        } else {
          resolve("deny");
        }
      });
    }

    if (decision === "deny") return "User denied execution.";
    if (decision === "allow_always")
      this.permissionEngine.registerDecision(call.name, decision);

    const tool = findTool(call.name);
    if (!tool) return `Unknown tool: ${call.name}`;

    try {
      return await tool.execute(call.args, this.context, {
        onAskUserQuestion: this.callbacks.onAskUserQuestion,
      });
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }
}
