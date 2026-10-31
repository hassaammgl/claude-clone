export type JobStatus = "running" | "done" | "failed" | "killed";
export type JobEvent = "start" | "finish";

export interface Job {
    id: string;
    command: string;
    cwd: string;
    status: JobStatus;
    startedAt: number;
    endedAt?: number;
    exitCode?: number;
    lastOutputAt: number;
    stdout: string;
    stderr: string;
    finished: Promise<number>;
    proc: ReturnType<typeof Bun.spawn>;
    useSetsid: boolean;
}

const MAX_OUTPUT = 500_000;
const MAX_JOBS = 50;
const HEAD_CHARS = 4_000;

function append(job: Job, key: "stdout" | "stderr", text: string) {
    if (!text) return;
    const next = job[key] + text;
    job[key] = next.length > MAX_OUTPUT ? next.slice(-MAX_OUTPUT) : next;
    job.lastOutputAt = Date.now();
}

async function collect(stream: ReadableStream<Uint8Array>, job: Job, key: "stdout" | "stderr") {
    const decoder = new TextDecoder();
    try {
        for await (const chunk of stream) append(job, key, decoder.decode(chunk, { stream: true }));
        append(job, key, decoder.decode());
    } catch {
        // process killed / stream closed
    }
}

function seconds(ms: number): number {
    return Math.max(0, Math.round(ms / 1000));
}

/**
 * Background shell jobs. BashTool command ko yahan start karta hai; timeout pe kill nahi hota,
 * job chalta rehta hai aur agent `wait`/`status` se track karta hai.
 */
export class JobManager {
    private jobs = new Map<string, Job>();
    private nextId = 1;

    constructor(private onEvent?: (event: JobEvent, job: Job) => void) {}

    start(command: string, cwd: string): Job {
        const id = String(this.nextId++);
        const useSetsid = !!Bun.which("setsid");
        const proc = Bun.spawn([...(useSetsid ? ["setsid"] : []), "bash", "-c", command], {
            cwd,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            env: {
                ...process.env,
                PAGER: "cat",
                GIT_PAGER: "cat",
                GIT_TERMINAL_PROMPT: "0",
            } as Record<string, string>,
        });

        const now = Date.now();
        const job: Job = {
            id,
            command,
            cwd,
            status: "running",
            startedAt: now,
            lastOutputAt: now,
            stdout: "",
            stderr: "",
            finished: Promise.resolve(0),
            proc,
            useSetsid,
        };
        this.jobs.set(id, job);

        const readers = Promise.all([collect(proc.stdout, job, "stdout"), collect(proc.stderr, job, "stderr")]);

        job.finished = (async () => {
            let code = -1;
            try {
                code = await proc.exited;
            } catch {
                // spawn/exit error: failed ke roop me dikhao
            }
            await readers;
            job.exitCode = code;
            job.endedAt = Date.now();
            if (job.status !== "killed") job.status = code === 0 ? "done" : "failed";
            try {
                this.onEvent?.("finish", job);
            } catch {
                // logging fail ho to job na ruke
            }
            this.prune();
            return code;
        })();

        try {
            this.onEvent?.("start", job);
        } catch {
            // ignore logging errors
        }
        return job;
    }

    get(id: string): Job {
        const key = String(id ?? "").trim().replace(/^job[- ]?/i, "");
        const job = this.jobs.get(key);
        if (!job) throw new Error(`unknown job id: ${key || "(empty)"} (use action=list)`);
        return job;
    }

    list(): Job[] {
        return [...this.jobs.values()];
    }

    async wait(id: string, timeoutMs: number): Promise<{ job: Job; timedOut: boolean }> {
        const job = this.get(id);
        if (job.status !== "running") return { job, timedOut: false };

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
        });

        const completed = await Promise.race([
            job.finished.then(
                () => true,
                () => true,
            ),
            timeout,
        ]);
        if (timer) clearTimeout(timer);
        return { job, timedOut: !completed };
    }

    kill(id: string): Job {
        const job = this.get(id);
        if (job.status !== "running") return job;
        job.status = "killed";
        try {
            if (job.useSetsid) process.kill(-job.proc.pid, "SIGKILL");
            else job.proc.kill("SIGKILL");
        } catch {
            // already gone
        }
        return job;
    }

    /** Job output tail; errors build ke end me hote hain, isliye tail zyada useful hai. */
    output(job: Job, max = 20_000): string {
        const text = [job.stdout.trimEnd(), job.stderr.trimEnd() ? `[stderr]\n${job.stderr.trimEnd()}` : ""]
            .filter(Boolean)
            .join("\n");
        if (!text) return "(no output yet)";
        if (text.length <= max) return text;
        const tail = max - HEAD_CHARS;
        return `${text.slice(0, HEAD_CHARS)}\n... [${text.length - max} chars truncated] ...\n${text.slice(-tail)}`;
    }

    describe(job: Job): string {
        const elapsed = seconds((job.endedAt ?? Date.now()) - job.startedAt);
        const idle = seconds(Date.now() - job.lastOutputAt);
        const exit = job.exitCode === undefined ? "" : `, exit ${job.exitCode}`;
        const wait = job.status === "running" ? `, last output ${idle}s ago` : "";
        return `job ${job.id} ${job.status} (${elapsed}s${exit}${wait}) — ${job.command}`;
    }

    render(): string {
        if (!this.jobs.size) return "No background jobs.";
        return this.list().map((job) => this.describe(job)).join("\n");
    }

    /** App exit pe running jobs kill karo, taake orphan builds na rahein. */
    async closeAll() {
        const running = this.list().filter((job) => job.status === "running");
        for (const job of running) this.kill(job.id);
        if (!running.length) return;
        await Promise.race([
            Promise.allSettled(running.map((job) => job.finished)),
            new Promise((resolve) => setTimeout(resolve, 1_500)),
        ]);
    }

    private prune() {
        if (this.jobs.size <= MAX_JOBS) return;
        for (const job of this.jobs.values()) {
            if (job.status === "running") continue;
            this.jobs.delete(job.id);
            if (this.jobs.size <= MAX_JOBS) break;
        }
    }
}
