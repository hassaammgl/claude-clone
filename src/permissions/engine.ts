import fs from "fs";
import path from "path";
import os from "os";

export type PermissionResult = "allow" | "deny" | "ask";
export type PermissionChoice = "allow_once" | "allow_always" | "deny";

interface Settings {
  allowedTools: string[];
}

export class PermissionEngine {
  private settingsPath: string;
  private settings: Settings;

  constructor() {
    const configDir = path.join(os.homedir(), ".config", "claude-clone");
    this.settingsPath = path.join(configDir, "settings.json");
    
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    this.settings = this.loadSettings();
  }

  private loadSettings(): Settings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
    return { allowedTools: [] };
  }

  private saveSettings() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }

  public checkPermission(toolName: string, context?: { planMode?: boolean }): PermissionResult {
    // Auto-deny destructive tools while in plan mode
    if (context?.planMode) {
      const planModeBlocked = ["write_file", "edit_file", "bash", "cron_start"];
      if (planModeBlocked.includes(toolName)) {
        return "deny";
      }
    }

    // If already approved, allow it
    if (this.settings.allowedTools.includes(toolName)) {
      return "allow";
    }
    return "ask";
  }

  public registerDecision(toolName: string, decision: PermissionChoice) {
    if (decision === "allow_always") {
      if (!this.settings.allowedTools.includes(toolName)) {
        this.settings.allowedTools.push(toolName);
        this.saveSettings();
      }
    }
  }

  public getAlwaysAllowed(): string[] {
    return this.settings.allowedTools;
  }
}
