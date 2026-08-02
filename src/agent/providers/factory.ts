import Anthropic from "@anthropic-ai/sdk";
import { loadSettings } from "../../config/settings";
import { ClaudeProvider } from "./claude";
import { createGeminiModel, GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";
import { OpenAIProvider } from "./openai";
import type { LlmProvider, ProviderName } from "./types";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "gemma4:e4b";

export interface ProviderBundle {
  provider: LlmProvider;
  name: ProviderName;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  ollamaApiKey?: string;
  gemini?: GeminiProvider;
  claude?: ClaudeProvider;
}

function resolveKeys() {
  const settings = loadSettings();
  return {
    settings,
    geminiKey:
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      settings.geminiApiKey,
    claudeKey: process.env.ANTHROPIC_API_KEY || settings.anthropicApiKey,
    openaiApiKey: process.env.OPENAI_API_KEY || settings.openaiApiKey,
    openaiBaseUrl: (
      process.env.OPENAI_BASE_URL ||
      settings.openaiBaseUrl ||
      DEFAULT_OPENAI_BASE_URL
    ).replace(/\/+$/, ""),
    openaiModel:
      process.env.OPENAI_MODEL || settings.openaiModel || DEFAULT_OPENAI_MODEL,
    ollamaBaseUrl: (
      process.env.OLLAMA_BASE_URL ||
      settings.ollamaBaseUrl ||
      DEFAULT_OLLAMA_BASE_URL
    ).replace(/\/+$/, ""),
    ollamaModel:
      process.env.OLLAMA_MODEL ||
      process.env.MODEL ||
      settings.ollamaModel ||
      DEFAULT_OLLAMA_MODEL,
    ollamaApiKey: process.env.OLLAMA_API_KEY || settings.ollamaApiKey,
  };
}

function createClaudeBundle(apiKey: string): ProviderBundle {
  const claude = new ClaudeProvider(new Anthropic({ apiKey }));
  return { provider: claude, name: "claude", claude };
}

function createGeminiBundle(apiKey: string): ProviderBundle {
  const gemini = new GeminiProvider(createGeminiModel(apiKey));
  return { provider: gemini, name: "gemini", gemini };
}

function createOpenAIBundle(
  apiKey: string,
  baseUrl: string,
  model: string,
): ProviderBundle {
  return {
    provider: new OpenAIProvider({ apiKey, baseUrl, model }),
    name: "openai",
  };
}

function createOllamaBundle(
  baseUrl: string,
  model: string,
  apiKey?: string,
): ProviderBundle {
  return {
    provider: new OllamaProvider({ baseUrl, model, apiKey }),
    name: "ollama",
    ollamaModel: model,
    ollamaBaseUrl: baseUrl,
    ollamaApiKey: apiKey,
  };
}

function tryChosenProvider(
  keys: ReturnType<typeof resolveKeys>,
): ProviderBundle | null {
  const chosen = keys.settings.activeProvider;
  const hasOllamaConfigured = Boolean(
    process.env.OLLAMA_BASE_URL || keys.settings.ollamaBaseUrl,
  );
  const noCloudKeys = !keys.claudeKey && !keys.geminiKey && !keys.openaiApiKey;

  if (chosen === "claude" && keys.claudeKey) {
    return createClaudeBundle(keys.claudeKey);
  }
  if (chosen === "gemini" && keys.geminiKey) {
    return createGeminiBundle(keys.geminiKey);
  }
  if (chosen === "openai" && keys.openaiApiKey) {
    return createOpenAIBundle(
      keys.openaiApiKey,
      keys.openaiBaseUrl,
      keys.openaiModel,
    );
  }
  if (chosen === "ollama" && (hasOllamaConfigured || noCloudKeys)) {
    return createOllamaBundle(
      keys.ollamaBaseUrl,
      keys.ollamaModel,
      keys.ollamaApiKey,
    );
  }
  return null;
}

function fallbackProvider(
  keys: ReturnType<typeof resolveKeys>,
): ProviderBundle {
  if (keys.claudeKey) return createClaudeBundle(keys.claudeKey);
  if (keys.geminiKey) return createGeminiBundle(keys.geminiKey);
  if (keys.openaiApiKey) {
    return createOpenAIBundle(
      keys.openaiApiKey,
      keys.openaiBaseUrl,
      keys.openaiModel,
    );
  }
  return createOllamaBundle(
    keys.ollamaBaseUrl,
    keys.ollamaModel,
    keys.ollamaApiKey,
  );
}

export function createProviderBundle(): ProviderBundle {
  const keys = resolveKeys();
  return tryChosenProvider(keys) ?? fallbackProvider(keys);
}

export function createOllamaProviderBundle(
  model: string,
  baseUrl: string,
  apiKey?: string,
): ProviderBundle {
  return createOllamaBundle(baseUrl.replace(/\/+$/, ""), model, apiKey);
}
