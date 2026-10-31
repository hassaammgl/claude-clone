import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { Tool } from "./Tool";

const IGNORED = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".cache"]);
const MAX_FILE_BYTES = 1_000_000;
const MAX_GLOB_RESULTS = 200;
const MAX_GREP_MATCHES = 50;
const MAX_LINE_CHARS = 200;

/** "*.ts" jaise pattern (bina "/") ko har folder me match karne do: "**\/*.ts" */
function normalizeGlob(p: string): string {
    const q = String(p ?? "").trim().replace(/^\.\//, "");
    if (!q) throw new Error("pattern is empty");
    if (q.startsWith("/") || q.split("/").includes("..")) throw new Error("pattern must be relative, without '..'");
    return q.includes("/") ? q : `**/${q}`;
}

/** Base class: workspace ke andar files ka walk. node_modules/.git skip, symlinks follow nahi hote. */
abstract class SearchTool extends Tool {
    constructor(protected root: string) {
        super();
    }

    protected resolve(p: string = "."): string {
        const abs = resolve(this.root, p);
        if (relative(this.root, abs).startsWith("..")) throw new Error(`outside workspace: ${p}`);
        return abs;
    }

    protected async statOrThrow(abs: string, original: string) {
        try {
            return await stat(abs);
        } catch {
            throw new Error(`not found: ${original}`);
        }
    }

    protected async *walk(dir: string): AsyncGenerator<string> {
        const entries = await readdir(dir, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const e of entries) {
            const full = join(dir, e.name);
            if (e.isDirectory()) {
                if (!IGNORED.has(e.name)) yield* this.walk(full);
            } else if (e.isFile()) {
                yield full; // symlinks (isSymbolicLink) jaan bujh kar skip: workspace se bahar nahi jaate
            }
        }
    }
}

export class GlobTool extends SearchTool {
    name = "glob";
    description =
        "Find files by name pattern, e.g. 'src/**/*.ts' or '*.md' (a pattern without '/' matches in all folders). Returns paths relative to the workspace. Skips node_modules and .git.";
    parameters = {
        type: "object",
        properties: {
            pattern: { type: "string", description: "Glob pattern, e.g. src/**/*.ts" },
            path: { type: "string", description: "Folder to search in (default: workspace root)" },
        },
        required: ["pattern"],
    };

    async run({ pattern, path }: Record<string, any>) {
        const base = this.resolve(path);
        const info = await this.statOrThrow(base, path ?? ".");
        if (!info.isDirectory()) throw new Error(`${path} is a file, not a folder`);

        const glob = new Bun.Glob(normalizeGlob(pattern));
        const found: string[] = [];
        let more = false;
        for await (const file of this.walk(base)) {
            if (!glob.match(relative(base, file))) continue;
            if (found.length >= MAX_GLOB_RESULTS) {
                more = true;
                break;
            }
            found.push(relative(this.root, file));
        }
        if (!found.length) return "no files match";
        return found.join("\n") + (more ? `\n...[more than ${MAX_GLOB_RESULTS} files, narrow the pattern]` : "");
    }
}

export class GrepTool extends SearchTool {
    name = "grep";
    description =
        "Search file contents with a regex. Returns 'path:line: text' (line numbers match read_file/replace_lines). " +
        "Optional: path (folder or file), glob (filter files, e.g. '*.ts'), ignore_case, literal (treat pattern as plain text, not regex). Skips node_modules, .git, binary and huge files.";
    parameters = {
        type: "object",
        properties: {
            pattern: { type: "string", description: "Regex to search for" },
            path: { type: "string", description: "Folder or file (default: workspace root)" },
            glob: { type: "string", description: "Only search files matching this glob, e.g. *.ts" },
            ignore_case: { type: "boolean" },
            literal: { type: "boolean", description: "Plain text search instead of regex" },
        },
        required: ["pattern"],
    };

    async run({ pattern, path, glob, ignore_case, literal }: Record<string, any>) {
        if (!pattern) throw new Error("pattern is empty");
        const source = literal ? String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : String(pattern);
        let re: RegExp;
        try {
            re = new RegExp(source, ignore_case ? "i" : "");
        } catch (e: any) {
            throw new Error(`invalid regex: ${e.message}. Use literal=true for plain text.`);
        }

        const target = this.resolve(path);
        const info = await this.statOrThrow(target, path ?? ".");
        const filter = glob ? new Bun.Glob(normalizeGlob(glob)) : null;
        const base = info.isDirectory() ? target : resolve(target, "..");
        const files = info.isDirectory() ? this.walk(target) : (async function* () { yield target; })();

        const hits: string[] = [];
        let more = false;

        outer: for await (const file of files) {
            if (filter && !filter.match(relative(base, file))) continue;
            const f = Bun.file(file);
            if (f.size > MAX_FILE_BYTES) continue;
            const head = new Uint8Array(await f.slice(0, 1024).arrayBuffer());
            if (head.includes(0)) continue; // binary

            const rel = relative(this.root, file);
            const lines = (await f.text()).split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (!re.test(lines[i]!)) continue;
                if (hits.length >= MAX_GREP_MATCHES) {
                    more = true;
                    break outer;
                }
                hits.push(`${rel}:${i + 1}: ${lines[i]!.trim().slice(0, MAX_LINE_CHARS)}`);
            }
        }

        if (!hits.length) return "no matches";
        return hits.join("\n") + (more ? `\n...[more than ${MAX_GREP_MATCHES} matches, narrow with path/glob]` : "");
    }
}
