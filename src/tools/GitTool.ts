import { Tool } from "./Tool";

const ACTIONS = ["status", "diff", "log", "show", "branch", "add", "commit"] as const;
const MAX_OUTPUT = 10_000;

/** Lambe git output ko head + tail me kaat do, taake context na bhare */
function clip(text: string): string {
    if (text.length <= MAX_OUTPUT) return text;
    const cut = text.length - MAX_OUTPUT;
    return `${text.slice(0, 6_000)}\n… [${cut} chars cut] …\n${text.slice(-4_000)}`;
}

/**
 * Git ke liye alag safe tool — har chhote kaam ke liye bash me shell string nahi banti.
 * Sirf read-only actions + add/commit; push/reset jaisi cheezein jaan bujh ke nahi hain.
 */
export class GitTool extends Tool {
    name = "git";
    description =
        "Run a git command in the workspace. Read-only: action=status/diff/log/show/branch. " +
        "Write: action=add (stage files) and action=commit (needs message). Push/reset are not supported — use bash only if the user asks.";
    parameters = {
        type: "object",
        properties: {
            action: { type: "string", enum: [...ACTIONS], description: "status/diff/log/show/branch/add/commit" },
            path: { type: "string", description: "Limit diff/status/show to this path" },
            ref: { type: "string", description: "Commit/ref for action=show or log (default HEAD / current branch)" },
            staged: { type: "boolean", description: "action=diff: show staged (--cached) changes" },
            limit: { type: "number", description: "action=log: how many commits (default 20, max 200)" },
            files: { type: "array", items: { type: "string" }, description: "action=add: paths to stage (default: all changes)" },
            message: { type: "string", description: "action=commit: commit message" },
        },
        required: ["action"],
    };

    constructor(private root: string) {
        super();
    }

    /** Sirf commit destructive maana gaya; add wapas unstage ho sakta hai */
    override dangerousFor(args: Record<string, any>): boolean {
        return actionOf(args) === "commit";
    }

    override preview(args: Record<string, any>) {
        const action = actionOf(args);
        if (action === "commit") return `git commit -m ${JSON.stringify(String(args.message ?? ""))}`;
        if (action === "add") return `git add ${(args.files ?? []).join(" ") || "-A"}`;
        return `git ${action}`;
    }

    async run(args: Record<string, any>) {
        const action = actionOf(args);
        const path = String(args.path ?? "").trim();
        const ref = String(args.ref ?? "").trim();

        switch (action) {
            case "status": {
                const out = await this.git(["status", "--short", "--branch", ...(path ? ["--", path] : [])]);
                return out || "(clean)";
            }
            case "diff": {
                const out = await this.git(["diff", ...(args.staged ? ["--cached"] : []), ...(ref ? [ref] : []), ...(path ? ["--", path] : [])]);
                return out || "(no changes)";
            }
            case "log": {
                const n = Math.min(Math.max(Math.floor(Number(args.limit) || 20), 1), 200);
                const out = await this.git(["log", "--oneline", "--decorate", `-n${n}`, ref || "HEAD", ...(path ? ["--", path] : [])]);
                return out || "(no commits)";
            }
            case "show": {
                const out = await this.git(["show", "--stat", "--patch", ref || "HEAD", ...(path ? ["--", path] : [])]);
                return out;
            }
            case "branch":
                return (await this.git(["branch", "-a", "--no-color"])) || "(no branches)";
            case "add": {
                const files = Array.isArray(args.files) ? args.files.map((f: any) => String(f)).filter(Boolean) : [];
                return (await this.git(["add", ...(files.length ? files : ["-A"])])) || `staged ${files.length ? files.join(", ") : "all changes"}`;
            }
            case "commit": {
                const message = String(args.message ?? "").trim();
                if (!message) throw new Error("message is required for action=commit");
                return (await this.git(["commit", "-m", message])) || "committed";
            }
            default:
                throw new Error(`unknown action: ${action}. Use one of: ${ACTIONS.join(", ")}`);
        }
    }

    /** Args array se chalao (shell string nahi), output clip karke wapas */
    private async git(args: string[]): Promise<string> {
        const proc = Bun.spawn(["git", ...args], {
            cwd: this.root,
            stdout: "pipe",
            stderr: "pipe",
            env: { ...process.env, GIT_PAGER: "cat", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
        });
        const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
        const code = await proc.exited;
        const text = clip([out, err].filter(Boolean).join("\n").trim());
        if (code !== 0) throw new Error(text || `git ${args[0]} failed (exit ${code})`);
        return text;
    }
}

function actionOf(args: Record<string, any>): string {
    return String(args.action ?? "status").trim().toLowerCase() || "status";
}
