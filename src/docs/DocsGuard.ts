import { stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, extname, join } from "node:path";
import type { Guard } from "../agent/Agent";
import type { Tool } from "../tools/Tool";
import { runCmd } from "./DocSource";

/** Is session me kin libraries ke docs padhe ja chuke hain (/clear pe reset) */
export class DocsRegistry {
    private read = new Set<string>();
    mark(name: string) {
        this.read.add(name.toLowerCase());
    }
    has(name: string) {
        return this.read.has(name.toLowerCase());
    }
    clear() {
        this.read.clear();
    }
}

type Lang = "js" | "py";

// C/C++ (.c .cpp .h ...) aur baaki extensions yahan nahi hain, to unpe koi check nahi
const EXT_LANG: Record<string, Lang> = {
    ".ts": "js", ".tsx": "js", ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".mts": "js", ".cts": "js",
    ".py": "py",
};

// file likhne/badalne wale tools: naya code (after) aur purana (before) kahan se milega
const GUARDED: Record<string, (a: Record<string, any>) => { before: string; after: string }> = {
    write_file: (a) => ({ before: "", after: String(a.content ?? "") }),
    edit_file: (a) => ({ before: String(a.old_string ?? ""), after: String(a.new_string ?? "") }),
    replace_lines: (a) => ({ before: "", after: String(a.new_content ?? "") }),
};

const JS_BUILTINS = new Set([...builtinModules.map((m) => m.split("/")[0]!), "bun"]);
const MAX_BLOCKS = 2; // ek package pe itni baar roko, phir jane do (agar model name galat de raha ho to deadlock na ho)

function jsPackages(code: string): Set<string> {
    const out = new Set<string>();
    for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (/^([./#~]|@\/|node:|bun:)/.test(spec)) continue; // relative, alias, builtin
        const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
        if (!JS_BUILTINS.has(name)) out.add(name);
    }
    return out;
}

function pyModules(code: string): Set<string> {
    const out = new Set<string>();
    for (const m of code.matchAll(/^[ \t]*from[ \t]+([A-Za-z_]\w*)[\w.]*[ \t]+import\b/gm)) out.add(m[1]!);
    for (const m of code.matchAll(/^[ \t]*import[ \t]+([^\n#;]+)/gm)) {
        for (const part of m[1]!.split(",")) {
            const top = part.trim().split(/\s+as\s+/)[0]!.split(".")[0]!.trim();
            if (/^[A-Za-z_]\w*$/.test(top)) out.add(top);
        }
    }
    return out;
}

async function exists(p: string): Promise<boolean> {
    try {
        await stat(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * Model prompt ke rules aksar bhool jata hai, isliye code se rokte hain:
 * JS/TS/Python file me aisa third-party import likhna jiske docs read_docs se nahi padhe -> Blocked.
 * C/C++ aur baaki languages exempt hain. Sirf import lines pakadta hai (sirf `lib.fn()` use pakad nahi sakta).
 */
export class DocsGuard implements Guard {
    private blocks = new Map<string, number>();
    private pyStdlib?: Promise<Set<string> | null>;

    constructor(
        private docs: DocsRegistry,
        private root: string,
    ) { }

    reset() {
        this.docs.clear();
        this.blocks.clear();
    }

    async check(tool: Tool, args: Record<string, any>): Promise<string | undefined> {
        const pick = GUARDED[tool.name];
        if (!pick) return;
        const path = String(args.path ?? "");
        const lang = EXT_LANG[extname(path).toLowerCase()];
        if (!lang) return;

        const { before, after } = pick(args);
        const used = await this.packages(lang, after, path);
        const already = await this.packages(lang, before, path); // edit se pehle bhi jo import tha, wo naya nahi
        const missing = [...used].filter(
            (p) => !already.has(p) && !this.docs.has(p) && (this.blocks.get(p) ?? 0) < MAX_BLOCKS,
        );
        if (!missing.length) return;

        for (const p of missing) this.blocks.set(p, (this.blocks.get(p) ?? 0) + 1);
        const lname = lang === "js" ? "js" : "python";
        return (
            `Blocked: this code uses ${missing.map((p) => `"${p}"`).join(", ")} but you have not read the docs yet. ` +
            `First call read_docs for each, e.g. read_docs {"name":"${missing[0]}","language":"${lname}"}, then retry this edit. ` +
            `If no docs exist, read_docs will say so and you may continue.`
        );
    }

    private async packages(lang: Lang, code: string, filePath: string): Promise<Set<string>> {
        if (lang === "js") return jsPackages(code);

        const mods = pyModules(code);
        const stdlib = await this.stdlib();
        if (!stdlib) return new Set(); // python3 nahi hai: python ka check skip
        const out = new Set<string>();
        for (const m of mods) {
            if (stdlib.has(m)) continue;
            const here = [this.root, dirname(join(this.root, filePath))];
            const local = await Promise.all(here.flatMap((d) => [exists(join(d, `${m}.py`)), exists(join(d, m))]));
            if (!local.some(Boolean)) out.add(m); // apna hi module nahi hai to third-party hai
        }
        return out;
    }

    private stdlib(): Promise<Set<string> | null> {
        this.pyStdlib ??= runCmd(["python3", "-c", "import sys;print(' '.join(sys.stdlib_module_names))"]).then((r) =>
            r && r.code === 0 && r.out.trim() ? new Set(r.out.trim().split(/\s+/)) : null,
        );
        return this.pyStdlib;
    }
}