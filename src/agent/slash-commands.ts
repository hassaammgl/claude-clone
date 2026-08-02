import type { SessionContext } from "./context";
import type { AgentLoopCallbacks } from "./callbacks";
import type { PermissionEngine } from "../permissions/engine";
import { loadSettings, saveSettings } from "../config/settings";
import { getToolDefinitions } from "../tools/index";
import { isRecord } from "./providers/types";
import { buildHelpText } from "./system-prompt";
import { clearSessionForCwd, saveSession } from "./session-store";

const BYTES_PER_GIB = 1024 * 1024 * 1024;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

export interface SlashCommandHost {
  context: SessionContext;
  callbacks: AgentLoopCallbacks;
  permissionEngine: PermissionEngine;
  ollamaModel?: string;
  setOllamaProvider: (model: string, baseUrl: string) => void;
  continueStep: () => Promise<void>;
}

type SlashHandler = (
  host: SlashCommandHost,
  args: string[],
) => void | Promise<void>;

interface OllamaModelInfo {
  name: string;
  size: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isOllamaModelInfo(value: unknown): value is OllamaModelInfo {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.size === "number"
  );
}

async function listOllamaModels(baseUrl: string): Promise<OllamaModelInfo[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`);
  if (!res.ok) {
    throw new Error(`Failed to fetch models from Ollama at ${baseUrl}`);
  }
  const data: unknown = await res.json();
  if (!isRecord(data) || !Array.isArray(data.models)) {
    return [];
  }
  return data.models.filter(isOllamaModelInfo);
}

function formatModelsList(
  models: OllamaModelInfo[],
  baseUrl: string,
  currentModel: string,
): string {
  const formattedList = models
    .map((model) => {
      const sizeGb = (model.size / BYTES_PER_GIB).toFixed(2);
      const active = model.name === currentModel ? " *active*" : "";
      return `- ${model.name} (${sizeGb} GB)${active}`;
    })
    .join("\n");
  return `Available Ollama models at ${baseUrl}:\n${formattedList}\n\nTo switch model, type: \`/models <model-name>\``;
}

async function switchOllamaModel(
  host: SlashCommandHost,
  baseUrl: string,
  newModel: string,
): Promise<void> {
  const settings = loadSettings();
  settings.ollamaModel = newModel;
  settings.ollamaBaseUrl = settings.ollamaBaseUrl || baseUrl;
  settings.activeProvider = "ollama";
  saveSettings(settings);
  host.setOllamaProvider(newModel, baseUrl);
  host.context.messages.push({
    role: "assistant",
    content: `✅ Switched to Ollama · **${newModel}**\n\nSettings saved — this model will be used on next restart too.`,
  });
}

async function handleModelsCommand(
  host: SlashCommandHost,
  args: string[],
): Promise<void> {
  const settings = loadSettings();
  const baseUrl =
    process.env.OLLAMA_BASE_URL ||
    settings.ollamaBaseUrl ||
    DEFAULT_OLLAMA_BASE_URL;

  try {
    if (args.length > 0) {
      await switchOllamaModel(host, baseUrl, args.join(" "));
    } else {
      const modelsList = await listOllamaModels(baseUrl);
      const content =
        modelsList.length === 0
          ? `No Ollama models found at ${baseUrl}. Make sure Ollama is running and you have pulled some models.`
          : formatModelsList(
              modelsList,
              baseUrl,
              host.ollamaModel ||
                process.env.OLLAMA_MODEL ||
                settings.ollamaModel ||
                "None",
            );
      host.context.messages.push({ role: "assistant", content });
    }
  } catch (error: unknown) {
    host.context.messages.push({
      role: "assistant",
      content: `Error listing/switching models: ${errorMessage(error)}`,
    });
  }
  host.callbacks.onContextUpdate?.(host.context);
  host.callbacks.onWaitUserInput?.();
}

function handleSetupCommand(host: SlashCommandHost): void {
  const unapprovedTools = getToolDefinitions()
    .map((tool) => tool.name)
    .filter((name) => !host.permissionEngine.getAlwaysAllowed().includes(name));

  if (unapprovedTools.length === 0) {
    host.context.messages.push({
      role: "assistant",
      content: "All tools are already pre-approved! 🎉",
    });
    host.callbacks.onWaitUserInput?.();
    return;
  }

  host.callbacks.onAskBulkPermission?.(unapprovedTools, (allowed) => {
    host.permissionEngine.registerBulkDecisions(allowed);
    host.context.messages.push({
      role: "assistant",
      content: `Pre-approved ${allowed.length} tools: ${allowed.join(", ")}. I will proceed with your request.`,
    });
    host.callbacks.onContextUpdate?.(host.context);
    void host.continueStep();
  });
}

function handleHelpCommand(host: SlashCommandHost): void {
  host.context.messages.push({ role: "assistant", content: buildHelpText() });
  host.callbacks.onWaitUserInput?.();
}

function handleClearCommand(host: SlashCommandHost): void {
  host.context.messages = [];
  host.context.tasks = [];
  host.context.stats.messageCount = 0;
  clearSessionForCwd(host.context.workingDirectory);
  saveSession(host.context);
  host.callbacks.onContextUpdate?.(host.context);
  host.callbacks.onWaitUserInput?.();
}

function handlePermissionsCommand(host: SlashCommandHost): void {
  host.context.messages.push({
    role: "assistant",
    content:
      "Permission Engine Status: Active\nAlways Allowed: " +
      JSON.stringify([...host.permissionEngine.getAlwaysAllowed()]),
  });
  host.callbacks.onWaitUserInput?.();
}

async function handleMcpCommand(host: SlashCommandHost): Promise<void> {
  const mcpStatus = await host.context.mcpManager.listAllTools();
  host.context.messages.push({
    role: "assistant",
    content:
      "Connected MCP Servers: " +
      mcpStatus.map((server) => server.serverName).join(", "),
  });
  host.callbacks.onWaitUserInput?.();
}

function handleSettingsCommand(host: SlashCommandHost): void {
  host.context.messages.push({
    role: "assistant",
    content:
      "Current Settings:\nWorkingDirectory: " + host.context.workingDirectory,
  });
  host.callbacks.onContextUpdate?.(host.context);
  host.callbacks.onWaitUserInput?.();
}

function handleWaifuCommand(host: SlashCommandHost): void {
  const settings = loadSettings();
  settings.waifuMode = !settings.waifuMode;
  saveSettings(settings);
  host.context.messages.push({
    role: "assistant",
    content: settings.waifuMode
      ? "🌸 Waifu mode ENABLED! Kyaa~ Noni-chan is so happy to serve you, senpai~! ✨💕"
      : "Waifu mode disabled. Noni-chan is back to professional mode. 🤖",
  });
  host.callbacks.onContextUpdate?.(host.context);
  host.callbacks.onWaitUserInput?.();
}

const SLASH_COMMANDS: Record<string, SlashHandler> = {
  "/help": (host) => handleHelpCommand(host),
  "/models": (host, args) => handleModelsCommand(host, args),
  "/setup": (host) => handleSetupCommand(host),
  "/clear": (host) => handleClearCommand(host),
  "/permissions": (host) => handlePermissionsCommand(host),
  "/mcp": (host) => handleMcpCommand(host),
  "/settings": (host) => handleSettingsCommand(host),
  "/waifu": (host) => handleWaifuCommand(host),
};

export async function handleSlashCommand(
  host: SlashCommandHost,
  command: string,
): Promise<boolean> {
  const [cmd, ...args] = command.split(" ");
  if (!cmd) return false;
  const handler = SLASH_COMMANDS[cmd];
  if (!handler) return false;
  await handler(host, args);
  return true;
}
