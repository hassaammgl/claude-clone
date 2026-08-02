import type { SessionContext } from "./context";
import type { AgentLoopCallbacks } from "./callbacks";
import { PermissionEngine } from "../permissions/engine";
import type { PermissionChoice } from "../permissions/engine";
import { findTool } from "../tools/index";
import {
  createOllamaProviderBundle,
  createProviderBundle,
  type LlmProvider,
  type ProviderBundle,
  type ProviderName,
  type ToolCallRequest,
} from "./providers/index";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { handleSlashCommand } from "./slash-commands";

export type { AgentLoopCallbacks } from "./callbacks";

const MESSAGE_COMPACT_THRESHOLD = 40;
const COMPACT_KEEP_RECENT = 20;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AgentLoop {
  private providerImpl!: LlmProvider;
  private provider!: ProviderName;
  private context: SessionContext;
  private callbacks: AgentLoopCallbacks;
  private permissionEngine: PermissionEngine;
  private ollamaModel?: string;
  private ollamaApiKey?: string;
  private geminiProvider?: GeminiProvider;
  private claudeProvider?: ClaudeProvider;

  constructor(context: SessionContext, callbacks: AgentLoopCallbacks) {
    this.context = context;
    this.callbacks = callbacks;
    this.permissionEngine = new PermissionEngine();
    this.applyBundle(createProviderBundle());
  }

  private applyBundle(bundle: ProviderBundle): void {
    this.providerImpl = bundle.provider;
    this.provider = bundle.name;
    this.ollamaModel = bundle.ollamaModel;
    this.ollamaApiKey = bundle.ollamaApiKey;
    this.geminiProvider = bundle.gemini;
    this.claudeProvider = bundle.claude;
  }

  public getProvider(): ProviderName {
    return this.provider;
  }

  public getOllamaModel(): string | undefined {
    return this.ollamaModel;
  }

  public getModelLabel(): string {
    if (this.provider === "ollama") {
      return `ollama · ${this.ollamaModel || "default"}`;
    }
    if (this.provider === "claude") return "claude · sonnet";
    if (this.provider === "gemini") return "gemini · flash";
    if (this.provider === "openai") {
      return "openai · chat";
    }
    return this.provider;
  }

  public getAlwaysAllowed(): string[] {
    const allowed = this.permissionEngine.getAlwaysAllowed();
    return Array.isArray(allowed) ? [...allowed] : [];
  }

  public approveTools(tools: string[]): void {
    this.permissionEngine.registerBulkDecisions(tools);
  }

  public reloadFromSettings(): void {
    this.applyBundle(createProviderBundle());
  }

  public getContext(): SessionContext {
    return this.context;
  }

  public async start(): Promise<void> {
    if (this.context.messages.length === 0) {
      this.callbacks.onWaitUserInput?.();
      return;
    }
    await this.step();
  }

  public async submitUserMessage(content: string): Promise<void> {
    if (content.startsWith("/")) {
      const handled = await handleSlashCommand(this.slashHost(), content);
      if (handled) return;
    }
    this.context.messages.push({ role: "user", content });
    this.context.stats.messageCount = this.context.messages.length;
    this.callbacks.onContextUpdate?.(this.context);
    await this.step();
  }

  private slashHost() {
    return {
      context: this.context,
      callbacks: this.callbacks,
      permissionEngine: this.permissionEngine,
      ollamaModel: this.ollamaModel,
      setOllamaProvider: (model: string, baseUrl: string) => {
        this.applyBundle(
          createOllamaProviderBundle(model, baseUrl, this.ollamaApiKey),
        );
      },
      continueStep: () => this.step(),
    };
  }

  private async compactConversation(): Promise<void> {
    const historyJson = JSON.stringify(
      this.context.messages.slice(0, COMPACT_KEEP_RECENT),
    );
    let summaryText = "";
    if (this.geminiProvider) {
      summaryText = await this.geminiProvider.summarize(historyJson);
    } else if (this.claudeProvider) {
      summaryText = await this.claudeProvider.summarize(historyJson);
    }

    this.context.messages = [
      { role: "user", content: `SUMMARY: ${summaryText}` },
      { role: "assistant", content: "I have the summary." },
      ...this.context.messages.slice(COMPACT_KEEP_RECENT),
    ];
    this.callbacks.onContextUpdate?.(this.context);
  }

  private async step(): Promise<void> {
    try {
      if (this.context.messages.length > MESSAGE_COMPACT_THRESHOLD) {
        await this.compactConversation();
      }
      await this.providerImpl.step({
        context: this.context,
        callbacks: this.callbacks,
        handleToolUse: (call) => this.executeToolCall(call),
        continueStep: () => this.step(),
      });
    } catch (error: unknown) {
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(errorMessage(error)),
      );
    }
  }

  private async executeToolCall(call: ToolCallRequest): Promise<string> {
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
    if (decision === "allow_always") {
      this.permissionEngine.registerDecision(call.name, decision);
    }

    const tool = findTool(call.name);
    if (!tool) return `Unknown tool: ${call.name}`;

    try {
      this.context.stats.toolCallCount++;
      return await tool.execute(call.args, this.context, {
        onAskUserQuestion: this.callbacks.onAskUserQuestion,
      });
    } catch (error: unknown) {
      return `Error: ${errorMessage(error)}`;
    }
  }
}
