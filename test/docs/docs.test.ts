import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, type AgentUI } from "../../src/agent/Agent";
import { DocsGuard, DocsRegistry } from "../../src/docs/DocsGuard";
import {
    DocSource,
    extractRelevant,
    normalizeLang,
    validateName,
    type DocPage,
    type DocRequest,
} from "../../src/docs/DocSource";
import { NodeModulesSource, SystemSource } from "../../src/docs/LocalSources";
import { RegistrySource } from "../../src/docs/RemoteSources";
import { ReadDocsTool } from "../../src/tools/DocsTool";
import { Tool } from "../../src/tools/Tool";

const tempDirs: string[] = [];

async function tempRoot() {
    const dir = await mkdtemp(join(tmpdir(), "noni-docs-"));
    tempDirs.push(dir);
    return dir;
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("validateName / normalizeLang", () => {
    test("accepts package, scoped and header names", () => {
        expect(validateName("zod")).toBe("zod");
        expect(validateName("@scope/pkg")).toBe("@scope/pkg");
        expect(validateName("stdio.h")).toBe("stdio.h");
        expect(validateName("<stdio.h>")).toBe("stdio.h");
        expect(validateName("std::vector")).toBe("vector");
        expect(validateName("net/http")).toBe("net/http");
    });

    test("rejects empty, flags and traversal", () => {
        expect(() => validateName("  ")).toThrow(/empty/);
        expect(() => validateName("--help")).toThrow(/invalid/);
        expect(() => validateName("../etc/passwd")).toThrow(/invalid/);
        expect(() => validateName("a b")).toThrow(/invalid/);
    });

    test("normalizes languages and falls back to other", () => {
        expect(normalizeLang("TypeScript")).toBe("js");
        expect(normalizeLang("python3")).toBe("py");
        expect(normalizeLang("C++")).toBe("c");
        expect(normalizeLang("golang")).toBe("go");
        expect(normalizeLang("rust")).toBe("other");
    });
});

describe("extractRelevant", () => {
    test("returns short text unchanged", () => {
        expect(extractRelevant("  hello  ", undefined)).toBe("hello");
    });

    test("keeps intro plus topic sections and drops the rest", () => {
        const text = [
            "# Intro",
            "intro line",
            "## Streaming",
            `stream data ${"x".repeat(3_000)}`,
            "## Unrelated",
            `other ${"y".repeat(5_000)}`,
            "## Streaming again",
            `more stream ${"z".repeat(3_000)}`,
        ].join("\n");

        const out = extractRelevant(text, "streaming", 4_000);
        expect(out).toContain("intro line");
        expect(out).toContain("Streaming");
        expect(out).not.toContain("other yyyy");
        expect(out).toContain("truncated");
        expect(out.length).toBeLessThan(4_100);
    });

    test("falls back to the beginning when nothing matches", () => {
        const text = `# Intro\nintro\n## Other\n${"q".repeat(5_000)}`;
        const out = extractRelevant(text, "nonexistent", 2_000);
        expect(out.startsWith("# Intro")).toBe(true);
        expect(out).toContain("truncated");
        expect(out.length).toBeLessThan(2_100);
    });
});

class FakeSource extends DocSource {
    calls = 0;

    constructor(
        readonly label: string,
        private page: DocPage | null,
        private langs: DocRequest["lang"][] = ["js", "py", "c", "go", "other"],
    ) {
        super();
    }

    supports(lang: DocRequest["lang"]) {
        return this.langs.includes(lang);
    }

    async find(): Promise<DocPage | null> {
        this.calls++;
        return this.page;
    }
}

describe("ReadDocsTool", () => {
    test("skips unsupported sources and tries them in order", async () => {
        const registry = new DocsRegistry();
        const pyOnly = new FakeSource("python-only", { source: "py", location: "x", text: "python docs" }, ["py"]);
        const js = new FakeSource("first", { source: "first", location: "a", text: "first docs" });
        const tool = new ReadDocsTool(registry, [pyOnly, js]);

        const out = await tool.run({ name: "zod", language: "js" });
        expect(out).toContain("first docs");
        expect(pyOnly.calls).toBe(0);
        expect(registry.has("zod")).toBe(true);
    });

    test("continues past thin metadata and uses the fuller page", async () => {
        const registry = new DocsRegistry();
        const thin = new FakeSource("thin", { source: "npm", location: "a", text: "only metadata", thin: true });
        const full = new FakeSource("full", { source: "web", location: "b", text: "real docs" });
        const tool = new ReadDocsTool(registry, [thin, full]);

        const out = await tool.run({ name: "zod", language: "js" });
        expect(out).toContain("real docs");
        expect(out).not.toContain("only metadata");
    });

    test("returns thin metadata when nothing better exists, and marks the library read", async () => {
        const registry = new DocsRegistry();
        const thin = new FakeSource("thin", { source: "npm", location: "a", text: "only metadata", thin: true });
        const tool = new ReadDocsTool(registry, [thin]);

        const out = await tool.run({ name: "zod", language: "js" });
        expect(out).toContain("only metadata");
        expect(registry.has("zod")).toBe(true);
    });

    test("marks the library read even when no docs are found", async () => {
        const registry = new DocsRegistry();
        const tool = new ReadDocsTool(registry, [new FakeSource("none", null)]);

        const out = await tool.run({ name: "ghost-pkg", language: "js" });
        expect(out).toContain("No docs found");
        expect(out).toContain("WITHOUT docs");
        expect(registry.has("ghost-pkg")).toBe(true);
    });

    test("a source that throws does not stop the next one", async () => {
        const registry = new DocsRegistry();
        const broken = new FakeSource("broken", null);
        broken.find = async () => {
            throw new Error("network down");
        };
        const full = new FakeSource("full", { source: "web", location: "b", text: "fallback docs" });
        const tool = new ReadDocsTool(registry, [broken, full]);

        const out = await tool.run({ name: "zod", language: "js" });
        expect(out).toContain("fallback docs");
    });

    test("rejects dangerous names before touching any source", async () => {
        const src = new FakeSource("full", { source: "x", location: "y", text: "z" });
        const tool = new ReadDocsTool(new DocsRegistry(), [src]);
        await expect(tool.run({ name: "--help", language: "js" })).rejects.toThrow(/invalid/);
        expect(src.calls).toBe(0);
    });
});

describe("DocsGuard", () => {
    const tool = (name: string) => ({ name }) as Tool;

    test("blocks new JS third-party imports until docs are marked read", async () => {
        const root = await tempRoot();
        const docs = new DocsRegistry();
        const guard = new DocsGuard(docs, root);

        const blocked = await guard.check(tool("write_file"), {
            path: "src/app.ts",
            content: 'import { z } from "zod";\nconsole.log(z);',
        });
        expect(blocked).toContain('"zod"');
        expect(blocked).toContain('read_docs {"name":"zod","language":"js"}');

        docs.mark("zod");
        expect(await guard.check(tool("write_file"), { path: "src/app.ts", content: 'import { z } from "zod";' })).toBeUndefined();
    });

    test("ignores builtins, relative imports and scoped subpaths are normalized", async () => {
        const guard = new DocsGuard(new DocsRegistry(), await tempRoot());
        const safe = [
            'import { readFile } from "node:fs/promises";',
            'import fs from "fs";',
            'import { x } from "./local";',
            'import { y } from "../up";',
            'const z = require("bun:test");',
        ].join("\n");
        expect(await guard.check(tool("write_file"), { path: "src/safe.ts", content: safe })).toBeUndefined();

        const blocked = await guard.check(tool("write_file"), {
            path: "src/scoped.ts",
            content: 'import { x } from "@acme/tool/subpath";',
        });
        expect(blocked).toContain('"@acme/tool"');
    });

    test("only checks imports newly added by an edit", async () => {
        const guard = new DocsGuard(new DocsRegistry(), await tempRoot());
        const blocked = await guard.check(tool("edit_file"), {
            path: "src/app.ts",
            old_string: 'import { z } from "zod";',
            new_string: 'import { z } from "zod";\nimport pad from "left-pad";',
        });
        expect(blocked).toContain("left-pad");
        expect(blocked).not.toContain('"zod"');
    });

    test("exempts C/C++ files", async () => {
        const guard = new DocsGuard(new DocsRegistry(), await tempRoot());
        for (const path of ["src/main.c", "src/main.cpp", "src/main.h", "src/main.hpp"]) {
            expect(await guard.check(tool("write_file"), { path, content: "#include <stdio.h>\n#include <vector>" })).toBeUndefined();
        }
    });

    test("blocks Python third-party modules but allows stdlib and local modules", async () => {
        const root = await tempRoot();
        await writeFile(join(root, "utils.py"), "x = 1\n");
        const guard = new DocsGuard(new DocsRegistry(), root);

        const blocked = await guard.check(tool("write_file"), {
            path: "main.py",
            content: "import os\nimport json\nimport requests\nfrom utils import x\nfrom . import local\n",
        });
        expect(blocked).toContain('"requests"');
        expect(blocked).not.toContain('"os"');
        expect(blocked).not.toContain('"json"');
        expect(blocked).not.toContain('"utils"');
    });

    test("allows after two blocks so a wrong package name cannot deadlock the model", async () => {
        const guard = new DocsGuard(new DocsRegistry(), await tempRoot());
        const args = { path: "src/a.ts", content: 'import x from "mystery-pkg";' };

        expect(await guard.check(tool("write_file"), args)).toContain("mystery-pkg");
        expect(await guard.check(tool("write_file"), args)).toContain("mystery-pkg");
        expect(await guard.check(tool("write_file"), args)).toBeUndefined();
    });

    test("reset clears both docs-read state and block counters", async () => {
        const docs = new DocsRegistry();
        const guard = new DocsGuard(docs, await tempRoot());
        const args = { path: "src/a.ts", content: 'import x from "zod";' };

        docs.mark("zod");
        expect(await guard.check(tool("write_file"), args)).toBeUndefined();
        guard.reset();
        expect(docs.has("zod")).toBe(false);
        expect(await guard.check(tool("write_file"), args)).toContain("zod");
    });
});

/** Fake Ollama stream: har chat() call script ki agli entry deta hai. */
function fakeOllama(script: any[][]) {
    let i = 0;
    return {
        async chat() {
            const parts = script[i++] ?? [{ message: { content: "done" } }];
            return (async function* () {
                for (const p of parts) yield p;
            })();
        },
    } as any;
}

describe("Agent guard lifecycle", () => {
    test("guard runs before the dangerous confirmation, and mark lets it through", async () => {
        const root = await tempRoot();
        const docs = new DocsRegistry();
        let ran = 0;
        let confirms = 0;

        class FakeWrite extends Tool {
            name = "write_file";
            description = "";
            parameters = {};
            override dangerous = true;
            async run() {
                ran++;
                return "written";
            }
        }

        const toolCall = (content: string) => [
            { message: { content: "", tool_calls: [{ function: { name: "write_file", arguments: { path: "a.ts", content } } }] } },
        ];
        const final = [{ message: { content: "ok" } }];
        const ollama = fakeOllama([
            toolCall('import x from "zod";'),
            final,
            toolCall('import x from "zod";'),
            final,
        ]);

        const ui: AgentUI = {
            assistantStart() {},
            assistantDelta() {},
            assistantEnd() {},
            toolCall() {},
            toolResult() {},
            async confirm() {
                confirms++;
                return true;
            },
            async confirmStrict() {
                return true;
            },
        };

        const agent = new Agent(ollama, "fake", ui, root);
        agent.addGuard(new DocsGuard(docs, root));
        agent.addTools(new FakeWrite());

        await agent.run("write it");
        expect(ran).toBe(0);
        expect(confirms).toBe(0);

        docs.mark("zod");
        await agent.run("write it");
        expect(ran).toBe(1);
        expect(confirms).toBe(1);
    });

    test("warns when the model hits its output/context limit", async () => {
        const warnings: string[] = [];
        const ollama = fakeOllama([
            [{ message: { content: "half an answer" }, done: true, done_reason: "length" }],
        ]);
        const ui: AgentUI = {
            assistantStart() {},
            assistantDelta() {},
            assistantEnd() {},
            toolCall() {},
            toolResult() {},
            warn(msg) {
                warnings.push(msg);
            },
            async confirm() {
                return true;
            },
            async confirmStrict() {
                return true;
            },
        };

        await new Agent(ollama, "fake", ui, process.cwd()).run("hello");
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("cut short");
    });
});

describe("real local sources", () => {
    test("NodeModulesSource reads an installed package", async () => {
        const src = new NodeModulesSource(process.cwd());
        const page = await src.find({ name: "ollama", lang: "js" });

        expect(page).not.toBeNull();
        expect(page!.source).toBe("installed package");
        expect(page!.location).toBe("node_modules/ollama");
        expect(page!.text.toLowerCase()).toContain("ollama");
    });

    test("SystemSource uses local pydoc for Python", async () => {
        const src = new SystemSource(process.cwd());
        const page = await src.find({ name: "json", lang: "py" });

        expect(page).not.toBeNull();
        expect(page!.source).toContain("pydoc");
        expect(page!.text).toContain("JSON");
    });

    test("SystemSource reads C headers when there is no man page", async () => {
        const src = new SystemSource(process.cwd());
        const page = await src.find({ name: "stdio.h", lang: "c", topic: "printf" });

        expect(page).not.toBeNull();
        expect(page!.source === "system header" || page!.source.startsWith("man page")).toBe(true);
        expect(page!.text).toContain("printf");
    });

    // Network tests: DOCS_LIVE=1 se chalao. Warna offline suite green rahe.
    test("RegistrySource reads npm and PyPI records (live, opt-in)", async () => {
        if (!process.env.DOCS_LIVE) return;
        const src = new RegistrySource();

        const npm = await src.find({ name: "zod", lang: "js" }, AbortSignal.timeout(20_000));
        expect(npm).not.toBeNull();
        expect(npm!.text.length).toBeGreaterThan(100);

        const pypi = await src.find({ name: "requests", lang: "py" }, AbortSignal.timeout(20_000));
        expect(pypi).not.toBeNull();
        expect(pypi!.text.length).toBeGreaterThan(100);
    });
});
