import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { getConfigDir } from "../config/paths";
import type { Message } from "./messages";
import type { SessionContext, SessionStats, Task } from "./context";

export interface StoredSession {
  sessionId: string;
  workingDirectory: string;
  messages: Message[];
  tasks: Task[];
  planMode: boolean;
  plan: string;
  stats: SessionStats;
  updatedAt: number;
}

export function getSessionsDir(): string {
  return path.join(getConfigDir(), "sessions");
}

function cwdKey(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

export function sessionFileForCwd(cwd: string): string {
  return path.join(getSessionsDir(), `${cwdKey(cwd)}.json`);
}

function ensureSessionsDir(): void {
  const dir = getSessionsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function toStoredSession(context: SessionContext): StoredSession {
  return {
    sessionId: context.sessionId,
    workingDirectory: context.workingDirectory,
    messages: context.messages,
    tasks: context.tasks,
    planMode: context.planMode,
    plan: context.plan,
    stats: context.stats,
    updatedAt: Date.now(),
  };
}

export function saveSession(context: SessionContext): void {
  try {
    ensureSessionsDir();
    const file = sessionFileForCwd(context.workingDirectory);
    fs.writeFileSync(file, JSON.stringify(toStoredSession(context), null, 2));
  } catch (error: unknown) {
    console.error("Failed to save session:", error);
  }
}

export function loadSessionForCwd(cwd: string): StoredSession | null {
  try {
    const file = sessionFileForCwd(cwd);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as StoredSession;
    if (!raw || !Array.isArray(raw.messages)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function clearSessionForCwd(cwd: string): void {
  try {
    const file = sessionFileForCwd(cwd);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (error: unknown) {
    console.error("Failed to clear session:", error);
  }
}

export function getSessionStorePath(cwd: string): string {
  return sessionFileForCwd(cwd);
}
