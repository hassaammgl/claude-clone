import fs from "fs";
import path from "path";
import { getConfigDir } from "./paths";

export interface Settings {
  model: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  ollamaApiKey?: string;
  /** How Ollama should call tools. auto = native + text fallback (best for small models). */
  ollamaToolMode?: "auto" | "native" | "prompt";
  activeProvider?: "claude" | "gemini" | "openai" | "ollama";
  waifuMode?: boolean;
  globalPermissions: string[];
  mcpServers: {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }[];
}

const DEFAULT_SETTINGS: Settings = {
  model: "claude-3-5-sonnet-20240620",
  ollamaToolMode: "auto",
  globalPermissions: [],
  mcpServers: []
};

const CONFIG_DIR = getConfigDir();
const SETTINGS_FILE = path.join(CONFIG_DIR, "settings.json");

export function loadSettings(): Settings {
  if (!fs.existsSync(SETTINGS_FILE)) {
    return { ...DEFAULT_SETTINGS, globalPermissions: [], mcpServers: [] };
  }

  try {
    const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(data) as Partial<Settings> & {
      allowedTools?: string[];
    };
    const globalPermissions = Array.isArray(parsed.globalPermissions)
      ? parsed.globalPermissions
      : Array.isArray(parsed.allowedTools)
        ? parsed.allowedTools
        : [];
    const mcpServers = Array.isArray(parsed.mcpServers)
      ? parsed.mcpServers
      : [];
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      globalPermissions,
      mcpServers,
    };
  } catch (error) {
    console.error("Error loading settings:", error);
    return { ...DEFAULT_SETTINGS, globalPermissions: [], mcpServers: [] };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

export function getSettingsFilePath(): string {
  return SETTINGS_FILE;
}
