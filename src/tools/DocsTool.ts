import type { DocsRegistry } from "../docs/DocsGuard";
import { normalizeLang, validateName, type DocPage, type DocSource } from "../docs/DocSource";
import { Tool } from "./Tool";

const SOURCE_TIMEOUT_MS = 12_000;

/**
 * Code likhne se pehle docs padho. Sources order me try hote hain (local pehle, internet last).
 * Docs mile ya na mile, registry me mark ho jata hai taake DocsGuard model ko atka na de.
 */
export class ReadDocsTool extends Tool {
    name = "read_docs";
    description =
        "Read documentation for a library, framework, API or system function BEFORE writing code that uses it. " +
        "Searches local sources first (installed packages, pydoc, go doc, man pages, system headers), then package registries, then the web. " +
        "Always pass the language. Use topic to focus on one feature.";
    parameters = {
        type: "object",
        properties: {
            name: {
                type: "string",
                description: "Package/library/header/function, e.g. 'zod', '@scope/pkg', 'requests', 'stdio.h', 'pthread_create', 'net/http'",
            },
            language: { type: "string", description: "js (JS/TS/Node/Bun), python, c (C/C++), go, java, rust or other" },
            topic: { type: "string", description: "Optional focus, e.g. 'streaming', 'printf', 'Client'" },
        },
        required: ["name", "language"],
    };

    constructor(
        private registry: DocsRegistry,
        private sources: DocSource[],
    ) {
        super();
    }

    async run(args: Record<string, any>) {
        const name = validateName(args.name);
        const lang = normalizeLang(args.language);
        const topic = args.topic ? String(args.topic).trim().slice(0, 100) : undefined;

        const tried: string[] = [];
        let thin: DocPage | undefined;
        for (const s of this.sources) {
            if (!s.supports(lang)) continue;
            try {
                const page = await s.find({ name, lang, topic }, AbortSignal.timeout(SOURCE_TIMEOUT_MS));
                if (page?.thin) {
                    thin ??= page; // sirf metadata: agla source behtar de sakta hai
                    tried.push(`${s.label}: only metadata`);
                    continue;
                }
                if (page) {
                    this.registry.mark(name);
                    return format(name, page);
                }
                tried.push(`${s.label}: not found`);
            } catch (e: any) {
                tried.push(`${s.label}: ${e.message}`);
            }
        }

        this.registry.mark(name); // dobara block nahi hoga (deadlock se bachne ke liye)
        if (thin) return format(name, thin);
        return (
            `No docs found for "${name}" (${tried.join("; ") || "no source for this language"}). ` +
            `Tell the user you are continuing WITHOUT docs for it, and only use APIs you are sure about.`
        );
    }
}

function format(name: string, page: DocPage): string {
    const head = `Docs for ${name}: ${page.source} (${page.location})`;
    return `${head}\n${page.hint ? `${page.hint}\n` : ""}------\n${page.text}`;
}