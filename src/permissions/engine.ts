import { loadSettings, saveSettings } from "../config/settings";

export type PermissionResult = "allow" | "deny" | "ask";
export type PermissionChoice = "allow_once" | "allow_always" | "deny";

const PLAN_MODE_BLOCKED = ["write_file", "edit_file", "bash", "cron_start"];

function readAllowedTools(): string[] {
  const settings = loadSettings() as {
    globalPermissions?: string[];
    allowedTools?: string[];
  };
  const fromGlobal = settings.globalPermissions;
  const fromLegacy = settings.allowedTools;
  if (Array.isArray(fromGlobal) && fromGlobal.length > 0) {
    return [...fromGlobal];
  }
  if (Array.isArray(fromLegacy)) {
    return [...fromLegacy];
  }
  if (Array.isArray(fromGlobal)) {
    return [...fromGlobal];
  }
  return [];
}

export class PermissionEngine {
  private allowedTools: string[];

  constructor() {
    this.allowedTools = readAllowedTools();
  }

  private persist(): void {
    const settings = loadSettings();
    settings.globalPermissions = [...this.allowedTools];
    saveSettings(settings);
  }

  public checkPermission(
    toolName: string,
    context?: { planMode?: boolean },
  ): PermissionResult {
    if (context?.planMode && PLAN_MODE_BLOCKED.includes(toolName)) {
      return "deny";
    }
    if (this.allowedTools.includes(toolName)) {
      return "allow";
    }
    return "ask";
  }

  public registerDecision(toolName: string, decision: PermissionChoice): void {
    if (decision !== "allow_always") return;
    if (this.allowedTools.includes(toolName)) return;
    this.allowedTools.push(toolName);
    this.persist();
  }

  public registerBulkDecisions(toolNames: string[]): void {
    let changed = false;
    for (const name of toolNames) {
      if (this.allowedTools.includes(name)) continue;
      this.allowedTools.push(name);
      changed = true;
    }
    if (changed) {
      this.persist();
    }
  }

  public getAlwaysAllowed(): string[] {
    return [...this.allowedTools];
  }
}
