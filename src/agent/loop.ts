import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import type { SessionContext } from "./context";
import { PermissionEngine } from "../permissions/engine";
import type { PermissionChoice } from "../permissions/engine";
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
  onAskBulkPermission?: (
    tools: string[],
    resolve: (allowed: string[]) => void,
  ) => void;
  onContextUpdate?: (context: SessionContext) => void;
  onError?: (error: Error) => void;
}

export class AgentLoop {
  private genAI?: GoogleGenerativeAI;
  private claude?: Anthropic;
  private model: any;
  private provider: "gemini" | "claude" = "gemini";
  private context: SessionContext;
  private callbacks: AgentLoopCallbacks;
  private permissionEngine: PermissionEngine;

  constructor(context: SessionContext, callbacks: AgentLoopCallbacks) {
    this.context = context;
    this.callbacks = callbacks;
    this.permissionEngine = new PermissionEngine();
    
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const claudeKey = process.env.ANTHROPIC_API_KEY;

    if (claudeKey) {
      this.provider = "claude";
      this.claude = new Anthropic({ apiKey: claudeKey });
    } else if (geminiKey) {
      this.provider = "gemini";
      this.genAI = new GoogleGenerativeAI(geminiKey);
      
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
  }

  public getProvider() {
    return this.provider;
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
    this.context.stats.messageCount = this.context.messages.length;
    this.callbacks.onContextUpdate?.(this.context);
    await this.step();
  }

  private async handleSlashCommand(command: string): Promise<boolean> {
    const [cmd, ...args] = command.split(" ");

    switch (cmd) {
      case "/help":
        this.context.messages.push({
          role: "assistant",
          content:
            "Available commands:\n- /help: Show this help\n- /setup: Quick-approve multiple tools at once\n- /clear: Clear conversation history\n- /permissions: Show permission status\n- /mcp: List MCP servers/tools\n- /settings: Show settings",
        });
        this.callbacks.onWaitUserInput?.();
        return true;
      case "/setup":
        const unapprovedTools = getToolDefinitions()
          .map((t) => t.name)
          .filter((name) => !this.permissionEngine.getAlwaysAllowed().includes(name));

        if (unapprovedTools.length === 0) {
          this.context.messages.push({
            role: "assistant",
            content: "All tools are already pre-approved! 🎉",
          });
          this.callbacks.onWaitUserInput?.();
          return true;
        }

        if (this.callbacks.onAskBulkPermission) {
          this.callbacks.onAskBulkPermission(unapprovedTools, (allowed) => {
            this.permissionEngine.registerBulkDecisions(allowed);
            this.context.messages.push({
              role: "assistant",
              content: `Pre-approved ${allowed.length} tools: ${allowed.join(", ")}. I will proceed with your request.`,
            });
            this.callbacks.onContextUpdate?.(this.context);
            this.step();
          });
        }
        return true;
      case "/clear":
        this.context.messages = [];
        this.callbacks.onWaitUserInput?.();
        return true;
      case "/permissions":
        this.context.messages.push({
          role: "assistant",
          content:
            "Permission Engine Status: Active\nAlways Allowed: " +
            JSON.stringify([...this.permissionEngine.getAlwaysAllowed()]),
        });
        this.callbacks.onWaitUserInput?.();
        return true;
      case "/mcp":
        const mcpStatus = await this.context.mcpManager.listAllTools();
        this.context.messages.push({
          role: "assistant",
          content:
            "Connected MCP Servers: " +
            mcpStatus.map((s) => s.serverName).join(", "),
        });
        this.callbacks.onWaitUserInput?.();
        return true;
      case "/settings":
        this.context.messages.push({
          role: "assistant",
          content:
            "Current Settings:\nWorkingDirectory: " +
            this.context.workingDirectory,
        });
        this.callbacks.onContextUpdate?.(this.context);
        this.callbacks.onWaitUserInput?.();
        return true;
    }
    return false;
  }

  private async compactConversation() {
    let summaryText = "";
    if (this.provider === "gemini" && this.model) {
      const chat = this.model.startChat({ history: [] });
      const result = await chat.sendMessage(
        `Summarize this history: ${JSON.stringify(this.context.messages.slice(0, 20))}`,
      );
      summaryText = result.response.text();
    } else if (this.provider === "claude" && this.claude) {
      const response = await this.claude.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: `Summarize this history: ${JSON.stringify(this.context.messages.slice(0, 20))}` }]
      });
      summaryText = (response.content[0] as any).text;
    }

    this.context.messages = [
      { role: "user", content: `SUMMARY: ${summaryText}` },
      { role: "assistant", content: "I have the summary." },
      ...this.context.messages.slice(20),
    ];
    this.callbacks.onContextUpdate?.(this.context);
  }

  private async step() {
    try {
      if (this.context.messages.length > 40) {
        await this.compactConversation();
      }

      if (this.provider === "gemini") {
        await this.stepGemini();
      } else {
        await this.stepClaude();
      }
    } catch (error: any) {
      this.callbacks.onError?.(error);
    }
  }

  private async stepClaude() {
    if (!this.claude) return;

    const tools = getToolDefinitions().map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema
    }));

    const messages = this.context.messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : msg.content
    })) as any;

    const response = await this.claude.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages,
      tools: tools as any
    });

    if (response.usage) {
      this.context.stats.totalTokens.input += response.usage.input_tokens || 0;
      this.context.stats.totalTokens.output += response.usage.output_tokens || 0;
    }

    let text = "";
    const toolCalls: any[] = [];

    for (const content of response.content) {
      if (content.type === "text") {
        text += content.text;
      } else if (content.type === "tool_use") {
        toolCalls.push({
          name: content.name,
          args: content.input,
          id: content.id
        });
      }
    }

    if (text) {
      this.context.messages.push({ role: "assistant", content: text });
      this.context.stats.messageCount = this.context.messages.length;
      this.callbacks.onContextUpdate?.(this.context);
      this.callbacks.onStreamComplete?.(text);
    }

    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const toolResult = await this.handleToolUse(call);
        this.context.messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: call.id,
              content: toolResult
            }
          ] as any
        });
        this.context.stats.messageCount = this.context.messages.length;
        this.callbacks.onContextUpdate?.(this.context);
      }
      await this.step();
    } else {
      this.callbacks.onWaitUserInput?.();
    }
  }

  private async stepGemini() {
    if (!this.model) return;

    // Map context messages to Gemini History
    const history = this.context.messages.slice(0, -1).map((msg) => ({
      role:
        msg.role === "assistant" ? "model" : "user",
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
    if (!lastMessage) return;
    const chat = this.model.startChat({ history });

    const result = await chat.sendMessage(
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content),
    );

    const response = result.response;
    
    if (response.usageMetadata) {
      this.context.stats.totalTokens.input += response.usageMetadata.promptTokenCount || 0;
      this.context.stats.totalTokens.output += response.usageMetadata.candidatesTokenCount || 0;
    }

    const text = response.text();

    if (text) {
      this.context.messages.push({ role: "assistant", content: text });
      this.context.stats.messageCount = this.context.messages.length;
      this.callbacks.onContextUpdate?.(this.context);
      this.callbacks.onStreamComplete?.(text);
    }

    const calls = response.functionCalls();
    if (calls && calls.length > 0) {
      for (const call of calls) {
        const toolResult = await this.handleToolUse(call);
        this.context.messages.push({
          role: "user",
          content: `Tool ${call.name} result: ${toolResult}`,
        });
        this.context.stats.messageCount = this.context.messages.length;
        this.callbacks.onContextUpdate?.(this.context);
      }
      await this.step();
    } else {
      this.callbacks.onWaitUserInput?.();
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
      this.context.stats.toolCallCount++;
      return await tool.execute(call.args, this.context, {
        onAskUserQuestion: this.callbacks.onAskUserQuestion,
      });
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }
}
