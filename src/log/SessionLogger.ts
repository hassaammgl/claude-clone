import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Agent is interface ko use karta hai; SessionLogger ise file me likhta hai. */
export interface AgentLog {
    assistant(content: string, thinking?: string): void;
    toolCall(name: string, args: Record<string, any>): void;
    toolResult(name: string, result: string, isError: boolean, durationMs?: number): void;
    error?(message: string): void;
    event?(type: LogType, data: Record<string, unknown>): void;
}

export type LogType =
    | "session_start"
    | "session_end"
    | "input"
    | "command"
    | "agent_start"
    | "agent_end"
    | "assistant"
    | "tool_call"
    | "tool_result"
    | "tool_error"
    | "guard_block"
    | "model"
    | "model_request"
    | "model_response"
    | "model_retry"
    | "mcp"
    | "job"
    | "error";

const MAX_FIELD = 20_000;

function safeValue(value: unknown): unknown {
    if (typeof value === "string") return value.length > MAX_FIELD ? `${value.slice(0, MAX_FIELD)}\n...[truncated]` : value;
    if (Array.isArray(value)) return value.map(safeValue);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = safeValue(v);
        return out;
    }
    return value;
}

/** JSONL event ko ek readable line me: "12:34:56 tool_call bash ..." */
export function formatLogLine(raw: string, max = 180): string {
    try {
        const event = JSON.parse(raw) as Record<string, unknown>;
        const time = String(event.time ?? "").slice(11, 19);
        const type = String(event.type ?? "log");
        const details = Object.entries(event)
            .filter(([k]) => k !== "time" && k !== "type")
            .map(([k, v]) => `${k}=${typeof v === "string" ? v.replace(/\s+/g, " ") : JSON.stringify(v)}`)
            .join(" ");
        const line = `${time} ${type} ${details}`.trim();
        return line.length > max ? `${line.slice(0, max - 1)}…` : line;
    } catch {
        return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
    }
}

/**
 * Session ka JSONL log. Default jagah: <cwd>/logs/session-<timestamp>.jsonl
 * (`logs` already .gitignore me hai). Write sync hai taake /exit pe bhi event na chhoote;
 * events chhote hote hain, isliye TUI noticeable block nahi hota.
 */
export class SessionLogger implements AgentLog {
    readonly path: string;
    private cwd: string;
    private closed = false;

    constructor(cwd: string, dir = process.env.NONI_LOG_DIR ?? join(cwd, "logs")) {
        this.cwd = cwd;
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        this.path = join(dir, `session-${stamp}-${process.pid}.jsonl`);
        try {
            mkdirSync(dir, { recursive: true });
            writeFileSync(this.path, "");
        } catch {
            // read-only dir: logging silently band, app nahi rukega
        }
    }

    log(type: LogType, data: Record<string, unknown> = {}): void {
        if (this.closed) return;
        const event = { time: new Date().toISOString(), type, ...(safeValue(data) as Record<string, unknown>) };
        try {
            appendFileSync(this.path, `${JSON.stringify(event)}\n`);
        } catch {
            // disk full / permission: logging fail ho to app na ruke
        }
    }

    input(text: string): void {
        this.log("input", { text, command: text.startsWith("/") });
    }

    command(text: string): void {
        this.log("command", { text });
    }

    event(type: LogType, data: Record<string, unknown> = {}): void {
        this.log(type, data);
    }

    model(model: string): void {
        this.log("model", { model });
    }

    sessionStart(model: string, tools: number): void {
        this.log("session_start", { cwd: this.cwd, model, tools, pid: process.pid });
    }

    sessionEnd(): void {
        this.log("session_end", {});
    }

    assistant(content: string, thinking?: string): void {
        if (!content && !thinking) return;
        this.log("assistant", { content, thinking });
    }

    toolCall(name: string, args: Record<string, any>): void {
        this.log("tool_call", { name, args: safeValue(args ?? {}) });
    }

    toolResult(name: string, result: string, isError: boolean, durationMs?: number): void {
        this.log(isError ? "tool_error" : "tool_result", { name, result, duration_ms: durationMs });
    }

    error(message: string): void {
        this.log("error", { message });
    }

    async flush() {
        // writes sync hain, isliye wait karne ki zaroorat nahi
    }

    async close() {
        this.closed = true;
    }

    /** `/logs` ke liye aakhri n readable lines. */
    async tail(n = 20): Promise<string[]> {
        await this.flush();
        try {
            const text = await Bun.file(this.path).text();
            return text
                .trimEnd()
                .split("\n")
                .filter(Boolean)
                .slice(-Math.max(1, Math.min(n, 200)))
                .map((line) => formatLogLine(line));
        } catch {
            return [];
        }
    }
}
