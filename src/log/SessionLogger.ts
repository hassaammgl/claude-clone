import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Agent is interface ko use karta hai; SessionLogger memory me rakhta hai aur TUI ko live feed deta hai. */
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
    | "voice"
    | "error";

export interface LogEvent {
    time: string;
    type: LogType;
    [key: string]: unknown;
}

export interface SessionLoggerOptions {
    /** File me bhi likhna hai? Default: false (sirf memory + TUI). */
    file?: boolean;
    /** File mode ki directory (default: NONI_LOG_DIR ya <cwd>/logs). */
    dir?: string;
    /** Memory me kitne events rakhne hain. */
    limit?: number;
    /** Live TUI feed callback: har event ki readable line. */
    onEvent?: (line: string, event: LogEvent) => void;
}

const MAX_FIELD = 20_000;
const DEFAULT_LIMIT = 500;

function envFlag(name: string): boolean {
    const value = (process.env[name] ?? "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
}

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

/** Event ko ek readable line me: "12:34:56 tool_call name=bash ..." */
export function formatLogEvent(event: Record<string, unknown>, max = 220): string {
    const time = String(event.time ?? "").slice(11, 19);
    const type = String(event.type ?? "log");
    const details = Object.entries(event)
        .filter(([k]) => k !== "time" && k !== "type")
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v.replace(/\s+/g, " ") : JSON.stringify(v)}`)
        .join(" ");
    const line = `${time} ${type}${details ? ` ${details}` : ""}`.trim();
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Raw JSONL line ko readable banao (purane log files padhne ke liye bhi kaam aata hai). */
export function formatLogLine(raw: string, max = 220): string {
    try {
        return formatLogEvent(JSON.parse(raw) as Record<string, unknown>, max);
    } catch {
        return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
    }
}

/**
 * Session ka in-memory log.
 *
 * Default me koi file nahi banti — events memory me rehte hain aur `onEvent` se TUI me
 * live dikhte hain. `/logs` memory se padhta hai. Agar file chahiye to `NONI_LOG_FILE=1`
 * (ya constructor me `file: true`) set kar do.
 */
export class SessionLogger implements AgentLog {
    readonly cwd: string;
    /** File mode off hone pe khali string. */
    readonly path: string;
    private events: LogEvent[] = [];
    private closed = false;
    private limit: number;
    private fileEnabled: boolean;
    private onEvent?: (line: string, event: LogEvent) => void;

    constructor(cwd: string, options: SessionLoggerOptions = {}) {
        this.cwd = cwd;
        this.limit = Math.max(20, options.limit ?? DEFAULT_LIMIT);
        this.onEvent = options.onEvent;

        let fileEnabled = options.file ?? envFlag("NONI_LOG_FILE");
        let path = "";

        if (fileEnabled) {
            const dir = options.dir ?? process.env.NONI_LOG_DIR ?? join(cwd, "logs");
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const file = join(dir, `session-${stamp}-${process.pid}.jsonl`);
            try {
                mkdirSync(dir, { recursive: true });
                writeFileSync(file, "");
                path = file;
            } catch {
                // read-only dir: file logging silently band, memory logging chalti rahegi
                fileEnabled = false;
            }
        }

        this.fileEnabled = fileEnabled;
        this.path = path;
    }

    /** Memory buffer me kitne events hain. */
    get count(): number {
        return this.events.length;
    }

    /** Kya file pe bhi likh rahe hain? */
    get writesFile(): boolean {
        return this.fileEnabled;
    }

    log(type: LogType, data: Record<string, unknown> = {}): void {
        if (this.closed) return;
        const event: LogEvent = {
            time: new Date().toISOString(),
            type,
            ...(safeValue(data) as Record<string, unknown>),
        };

        this.events.push(event);
        if (this.events.length > this.limit) this.events.splice(0, this.events.length - this.limit);

        if (this.fileEnabled && this.path) {
            try {
                appendFileSync(this.path, `${JSON.stringify(event)}\n`);
            } catch {
                // disk full / permission: logging fail ho to app na ruke
            }
        }

        try {
            this.onEvent?.(formatLogEvent(event), event);
        } catch {
            // TUI render fail ho to app na ruke
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

    /** Memory buffer ke aakhri n events (readable lines). */
    async tail(n = 20): Promise<string[]> {
        const take = Math.max(1, Math.min(n, 200));
        return this.events.slice(-take).map((event) => formatLogEvent(event));
    }

    async flush() {
        // memory + sync file writes: wait karne ki zaroorat nahi
    }

    async close() {
        this.closed = true;
    }
}
