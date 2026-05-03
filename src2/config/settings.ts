import fs from "fs";
import path from "path";
import os from "os";

export interface Settings {
  model: string;
  anthropicApiKey?: string;
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
  globalPermissions: [],
  mcpServers: []
};

const CONFIG_DIR = path.join(os.homedir(), ".claude-clone");
const SETTINGS_FILE = path.join(CONFIG_DIR, "settings.json");

export function loadSettings(): Settings {
  if (!fs.existsSync(SETTINGS_FILE)) {
    return DEFAULT_SETTINGS;
  }

  try {
    const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch (error) {
    console.error("Error loading settings:", error);
    return DEFAULT_SETTINGS;
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
