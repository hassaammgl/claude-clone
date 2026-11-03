import type { Message, Ollama, ToolCall } from "ollama";
import type { Tool } from "../tools/Tool";
import type { LlmSettings } from "../config/Config";
import { readText } from "../util/Fs";

export interface AgentUI {
    assistantStart(): void;
    assistantDelta(text: string): void;
    assistantEnd(): void;
    thinkingDelta?(text: string): void;
    thinkingEnd?(): void;
    waiting?(label?: string): void;
    waitingEnd?(): void;
    toolCall(name: string, args: Record<string, any>): void;
    toolResult(result: string, isError: boolean): void;
    warn?(msg: string): void;
    confirm(name: string, args: Record<string, any>, preview?: string, warnings?: string[]): Promise<boolean>;
    confirmStrict(): Promise<boolean>;
}

/** Env se positive integer, warna fallback. 0/NaN/"abc" ignore ho jate hain. */
function envInt(name: string, fallback: number): number {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Ollama/Bun ke timeout errors detect karo, taake sirf unhi pe context chhota karke retry ho. */
function isTimeoutError(e: unknown): boolean {
    const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
    return /timeout|timed out|abort|aborted/i.test(msg);
}

/** Ollama ka default num_ctx 4096 hai, isliye model ki max context khud detect karte hain. */
const FALLBACK_NUM_CTX = 32_768;
const NUM_PREDICT = envInt("OLLAMA_NUM_PREDICT", 4_096);
const TEMPERATURE = (() => {
    const n = Number(process.env.OLLAMA_TEMPERATURE);
    return Number.isFinite(n) && n >= 0 ? n : 0.4;
})();

/** Tool chalne se pehle check. String return karo to tool block hota hai aur wo string model ko error ban kar jati hai. */
export interface Guard {
    check(tool: Tool, args: Record<string, any>): Promise<string | undefined>;
    reset?(): void;
}

/** Persona lives in persona.md so it can be edited without touching the app. */
const PERSONA = (await readText(new URL("./persona.md", import.meta.url))).trim();

export class Agent {
    private tools = new Map<string, Tool>();
    private guards: Guard[] = [];
    private contexts: (() => string)[] = [];
    private messages: Message[] = [];
    private ctxByModel = new Map<string, number>();
    public think = false;

    constructor(
        private ollama: Ollama,
        public model: string,
        private ui: AgentUI,
        private cwd: string,
        private llm: LlmSettings = {},
    ) {
        this.reset();
    }

    addTools(...tools: Tool[]) {
        for (const t of tools) this.tools.set(t.name, t);
    }

    addGuard(guard: Guard) {
        this.guards.push(guard);
    }

    /** Har run ke system prompt me extra live context (jaise current todo plan). */
    addContext(provider: () => string) {
        this.contexts.push(provider);
    }

    listTools() {
        return [...this.tools.values()];
    }

    /**
     * Model ki context length. Pehle env, phir config (`llm.num_ctx`), warna model ki max.
     * Default config `"max"` hai, isliye har model apni poori context se chalta hai.
     */
    private async numCtx(): Promise<number> {
        const fromEnv = Number(process.env.OLLAMA_NUM_CTX);
        if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);

        const configured = this.llm.num_ctx;
        if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
            return Math.floor(configured);
        }

        const cached = this.ctxByModel.get(this.model);
        if (cached) return cached;

        try {
            const info = await this.ollama.show({ model: this.model });
            const raw = info.model_info as unknown;
            const entries =
                raw instanceof Map ? [...raw.entries()] : Object.entries((raw ?? {}) as Record<string, unknown>);
            const found = entries.find(([k]) => String(k).endsWith(".context_length"));
            const n = Number(found?.[1]);
            if (Number.isFinite(n) && n > 0) {
                this.ctxByModel.set(this.model, n);
                return n;
            }
        } catch {
            // metadata na mile to safe fallback
        }
        return FALLBACK_NUM_CTX;
    }

    reset() {
        this.messages = [{ role: "system", content: this.systemPrompt() }];
        this.guards.forEach((g) => g.reset?.()); // /clear pe docs-read list bhi saaf
    }

    /** Persona + live system info, taake Noni ko pata ho kahan chal rahi hai */
    private systemPrompt() {
        const tools = this.listTools().map((t) => t.name).join(", ") || "none";
        const os = ({ linux: "Linux", darwin: "macOS", win32: "Windows" } as Record<string, string>)[process.platform] ?? process.platform;
        const arch = ({ x64: "x86_64", arm64: "arm64", ia32: "x86" } as Record<string, string>)[process.arch] ?? process.arch;
        const extra = this.contexts
            .map((fn) => {
                try {
                    return fn().trim();
                } catch {
                    return "";
                }
            })
            .filter(Boolean)
            .join("\n\n");
        return `${PERSONA}

## Environment (live, authoritative)
- Operating system: ${os} (${arch})
- Working directory: ${this.cwd}
- Shell: bash -lc; user shell: ${process.env.SHELL ?? "unknown"}
- Runtime: JavaScript on ${process.release?.name ?? "node"} ${process.version}
- Date: ${new Date().toISOString().slice(0, 10)}
- Model: ${this.model}
- Tools: ${tools}
- Paths: relative to the working directory (e.g. src/index.ts). Don't wander outside it.
- For battery, CPU, memory, disk and uptime, use the system_info tool. Never guess hardware numbers.
- If the user asks about the system, answer from this block. Do not guess or contradict it.
${extra ? `\n## Current plan (live)\n${extra}\n` : ""}
## Reminder (always true)
- NONI is female: every Hindi/Urdu verb about yourself is feminine — "kar rahi hoon", "bataungi", "dekhi thi", "chala rahi hoon".
- One short dry joke is fine. Two is a stand-up set, and this is a terminal.`;
    }

    /** Model vision (image) input leta hai ya nahi — Ollama capabilities se, per model cache */
    private visionByModel = new Map<string, boolean>();
    async supportsVision(): Promise<boolean> {
        const cached = this.visionByModel.get(this.model);
        if (cached !== undefined) return cached;
        try {
            const info: any = await this.ollama.show({ model: this.model });
            const caps: string[] = Array.isArray(info?.capabilities) ? info.capabilities : [];
            const ok = caps.includes("vision");
            this.visionByModel.set(this.model, ok);
            return ok;
        } catch {
            return false;
        }
    }

    async run(input: string, images: string[] = []) {
        // Har run pe system prompt refresh, taake model/tools/date current rahe
        this.messages[0] = { role: "system", content: this.systemPrompt() };
        this.messages.push({ role: "user", content: input, ...(images.length ? { images } : {}) });

        await this.loop();
    }

    /** LLM -> tools -> LLM ... jab tak tool call aati rahe */
    private async loop() {
        // Agar model timeout ho, isi run ke baaki calls half context pe karo
        let ctxOverride: number | undefined;

        while (true) {
            this.ui.waiting?.();
            let numCtx = ctxOverride ?? (await this.numCtx());
            const open = () =>
                this.ollama.chat({
                    model: this.model,
                    messages: this.messages,
                    tools: this.listTools().map((t) => t.toOllama()),
                    think: this.think,
                    stream: true,
                    keep_alive: "30m",
                    options: {
                        num_ctx: numCtx,
                        num_predict: NUM_PREDICT,
                        temperature: TEMPERATURE,
                    },
                });

            let stream;
            try {
                stream = await open();
            } catch (e) {
                if (!isTimeoutError(e)) throw e;
                const reason = e instanceof Error ? e.message : String(e);
                numCtx = Math.max(4_096, Math.floor(numCtx / 2));
                ctxOverride = numCtx;
                this.ui.warn?.(`model request timed out; retrying with num_ctx=${numCtx}...`);
                stream = await open();
            }

            let content = "";
            let thinking = "";
            let doneReason = "";
            const calls: ToolCall[] = [];
            let started = false;

            try {
                for await (const part of stream) {
                    this.ui.waitingEnd?.();
                    if (part.done) doneReason = part.done_reason;
                    const msg = part.message;
                    if (msg.thinking) {
                        thinking += msg.thinking;
                        this.ui.thinkingDelta?.(msg.thinking);
                    }
                    if (msg.content) {
                        if (!started) {
                            started = true;
                            this.ui.assistantStart();
                        }
                        content += msg.content;
                        this.ui.assistantDelta(msg.content);
                    }
                    if (msg.tool_calls?.length) calls.push(...msg.tool_calls);
                }
            } catch (e) {
                // Sirf tab retry karo jab abhi tak kuch screen pe na aaya ho
                if (!started && !thinking && !calls.length && isTimeoutError(e)) {
                    const reason = e instanceof Error ? e.message : String(e);
                    numCtx = Math.max(4_096, Math.floor(numCtx / 2));
                    ctxOverride = numCtx;
                    this.ui.warn?.(`model stream timed out; retrying with num_ctx=${numCtx}...`);
                    continue;
                }
                throw e;
            }

            this.ui.waitingEnd?.();
            if (thinking) this.ui.thinkingEnd?.();
            if (started) this.ui.assistantEnd();
            if (doneReason === "length") {
                this.ui.warn?.(
                    `reply cut short: model limit hit (num_ctx=${numCtx}, num_predict=${NUM_PREDICT}). ` +
                        `Chat lambi hai to /clear karo; lamba jawab chahiye to OLLAMA_NUM_PREDICT badha do.`,
                );
            }

            const reply: Message = { role: "assistant", content };
            if (thinking) reply.thinking = thinking;
            if (calls.length) reply.tool_calls = calls;
            this.messages.push(reply);

            if (!calls.length) return;

            for (const call of calls) {
                const { name, arguments: args } = call.function;
                this.messages.push({ role: "tool", tool_name: name, content: await this.execute(name, args) });
            }
        }
    }

    private async execute(name: string, args: Record<string, any>): Promise<string> {
        const started = Date.now();
        const tool = this.tools.get(name);
        if (!tool) return this.fail(`unknown tool ${name}`, name, started);

        this.ui.toolCall(name, args);

        try {
            // Guards dangerous-confirm se pehle: blocked edit pe user ko bekar confirm na dikhe
            for (const guard of this.guards) {
                const blocked = await guard.check(tool, args);
                if (blocked) return this.fail(blocked, name, started);
            }

            if (tool.dangerousFor(args)) {
                const warnings = tool.warnings(args);
                const preview = await tool.preview?.(args);
                if (!(await this.ui.confirm(name, args, preview, warnings))) {
                    return this.fail("user denied this action", name, started);
                }
                if (warnings.length && !(await this.ui.confirmStrict())) {
                    return this.fail(
                        "user denied this risky command. Do not retry it; ask the user what to do instead.",
                        name,
                        started,
                    );
                }
            }

            this.ui.waiting?.(`running ${name}`);
            let out: string;
            try {
                out = await tool.run(args);
            } finally {
                this.ui.waitingEnd?.();
            }
            this.ui.toolResult(out, false);
            return out;
        } catch (e: any) {
            return this.fail(e.message, name, started);
        }
    }

    private fail(msg: string, toolName?: string, startedAt?: number): string {
        this.ui.toolResult(msg, true);
        return `Error: ${msg}`;
    }
}