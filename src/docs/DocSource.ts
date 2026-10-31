export type Lang = "js" | "py" | "c" | "go" | "other";

export interface DocRequest {
    name: string;
    lang: Lang;
    topic?: string;
}

export interface DocPage {
    source: string; // "installed package", "PyPI", "web"...
    location: string; // path ya URL
    text: string;
    hint?: string; // model ko aage kahan dekhna hai
    thin?: boolean; // sirf metadata mila (README nahi): agla source try karo, kuch na mile to yahi dedo
}

/**
 * Docs ka ek source (local package, system headers, registry, web...).
 * find() null de to "yahan nahi mila", agla source try hoga. Error throw karo to bhi agla try hoga.
 */
export abstract class DocSource {
    abstract readonly label: string;
    abstract supports(lang: Lang): boolean;
    abstract find(req: DocRequest, signal: AbortSignal): Promise<DocPage | null>;
}

export const MAX_DOC_CHARS = 8_000;
const INTRO_CHARS = 1_500;
const SECTION_CHARS = 2_500;

const LANGS: Record<string, Lang> = {
    js: "js", javascript: "js", ts: "js", typescript: "js", node: "js", nodejs: "js", bun: "js", jsx: "js", tsx: "js",
    py: "py", python: "py", python3: "py",
    c: "c", cpp: "c", "c++": "c", cxx: "c", cc: "c", "c/c++": "c",
    go: "go", golang: "go",
};

export function normalizeLang(raw: unknown): Lang {
    return LANGS[String(raw ?? "").toLowerCase().trim()] ?? "other";
}

/** Name command/path me jata hai, isliye sakht check: koi flag, "..", ya ajeeb character nahi */
export function validateName(raw: unknown): string {
    const n = String(raw ?? "").trim().replace(/^<|>$/g, "").replace(/^std::/, "");
    if (!n) throw new Error("name is empty");
    if (!/^[A-Za-z0-9@][A-Za-z0-9@_.+\/-]*$/.test(n) || n.includes("..")) throw new Error(`invalid name: ${n}`);
    return n;
}

export async function runCmd(
    cmd: string[],
    opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<{ out: string; code: number } | null> {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
        proc = Bun.spawn(cmd, {
            cwd: opts.cwd,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            env: { ...process.env, ...opts.env },
        });
    } catch {
        return null; // command installed nahi hai
    }
    const timer = setTimeout(() => proc.kill("SIGKILL"), opts.timeoutMs ?? 8_000);
    const [out, , code] = await Promise.all([
        new Response(proc.stdout as ReadableStream).text(),
        new Response(proc.stderr as ReadableStream).text(),
        proc.exited,
    ]);
    clearTimeout(timer);
    return { out, code };
}

// markdown heading ya man/pydoc style ALL-CAPS heading (NAME, SYNOPSIS, DESCRIPTION...)
const HEADING = /^(#{1,4} .+|[A-Z][A-Z ]{3,})$/;

/**
 * Bada doc ho to: shuru ka intro + topic se sabse zyada match karne wale sections (original order me).
 * Topic na ho ya kuch match na kare to bas shuru ka hissa.
 */
export function extractRelevant(text: string, topic: string | undefined, max = MAX_DOC_CHARS): string {
    const t = text.trim();
    if (t.length <= max) return t;
    const note = `\n...[truncated, ${t.length} chars total]`;
    const words = (topic ?? "").toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 2);

    const sections: string[] = [];
    let cur: string[] = [];
    for (const line of t.split("\n")) {
        if (HEADING.test(line) && cur.length) {
            sections.push(cur.join("\n"));
            cur = [];
        }
        cur.push(line);
    }
    if (cur.length) sections.push(cur.join("\n"));

    if (!words.length || sections.length < 2) return t.slice(0, max - note.length) + note;

    const score = (s: string) => {
        const low = s.toLowerCase();
        return words.reduce((n, w) => n + low.split(w).length - 1, 0);
    };
    const ranked = sections
        .map((s, i) => ({ i, score: score(s) }))
        .filter((x) => x.i > 0 && x.score > 0)
        .sort((a, b) => b.score - a.score);

    const chosen = new Set<number>([0]);
    let used = Math.min(sections[0]!.length, INTRO_CHARS);
    for (const { i } of ranked) {
        const len = Math.min(sections[i]!.length, SECTION_CHARS);
        if (used + len > max - note.length) continue;
        chosen.add(i);
        used += len;
    }
    if (chosen.size === 1) return t.slice(0, max - note.length) + note; // kuch match nahi hua

    return (
        [...chosen]
            .sort((a, b) => a - b)
            .map((i) => sections[i]!.slice(0, i === 0 ? INTRO_CHARS : SECTION_CHARS))
            .join("\n\n[...]\n\n") + note
    );
}