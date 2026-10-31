import { afterEach, describe, expect, test } from "bun:test";
import { DuckDuckGoProvider, parseDuckDuckGo } from "../../src/search/DuckDuckGoProvider";
import { SearchEngine } from "../../src/search/SearchEngine";
import { SearchProvider, type SearchResult } from "../../src/search/SearchProvider";
import { SearxngProvider } from "../../src/search/SearxngProvider";
import { WebSearchTool } from "../../src/tools/WebTools";

const servers: { stop(force?: boolean): unknown }[] = [];

function serve(handler: (req: Request) => Response | Promise<Response>) {
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: handler });
    servers.push(server);
    return `http://127.0.0.1:${server.port}`;
}

afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => s.stop(true)));
});

const fixture = (name: string) => Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text();

/** Ek port khol kar band kar do, taake "connection refused" wala case mile. */
async function deadUrl() {
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("x") });
    const url = `http://127.0.0.1:${server.port}`;
    await server.stop(true);
    return url;
}

const signal = () => AbortSignal.timeout(2_000);
const one: SearchResult = { title: "One", url: "https://one.test/page", snippet: "first" };

class FakeProvider extends SearchProvider {
    hits = 0;

    constructor(
        readonly name: string,
        private reply: () => Promise<SearchResult[]> | SearchResult[],
    ) {
        super();
    }

    async search(): Promise<SearchResult[]> {
        this.hits++;
        return this.reply();
    }
}

describe("SearxngProvider", () => {
    test("parses json results and sends format=json query", async () => {
        let last = "";
        const url = serve((req) => {
            last = req.url;
            return Response.json({
                results: [
                    { title: "A", url: "https://a.test/1", content: "  hello  " },
                    { title: "B", url: "https://b.test/2" },
                ],
            });
        });

        const results = await new SearxngProvider(url).search("bun runtime", 5, signal());
        expect(results).toEqual([
            { title: "A", url: "https://a.test/1", snippet: "hello" },
            { title: "B", url: "https://b.test/2", snippet: "" },
        ]);
        expect(last).toContain("/search?format=json&q=bun%20runtime");
    });

    test("drops entries without url/title and applies limit*2", async () => {
        const url = serve(() =>
            Response.json({
                results: [
                    { title: "A", url: "https://a.test" },
                    { title: "", url: "https://no-title.test" },
                    { title: "No URL" },
                    { title: "B", url: "https://b.test" },
                    { title: "C", url: "https://c.test" },
                ],
            }),
        );

        const results = await new SearxngProvider(url).search("q", 2, signal());
        expect(results.map((r) => r.title)).toEqual(["A", "B", "C"]);
        expect(results.map((r) => r.url)).toEqual(["https://a.test", "https://b.test", "https://c.test"]);
    });

    test("403 explains how to enable json", async () => {
        const url = serve(() => new Response("forbidden", { status: 403 }));
        await expect(new SearxngProvider(url).search("q", 5, signal())).rejects.toThrow(/search\.formats/);
    });

    test("HTTP 500 is a plain error", async () => {
        const url = serve(() => new Response("boom", { status: 500 }));
        await expect(new SearxngProvider(url).search("q", 5, signal())).rejects.toThrow(/HTTP 500/);
    });

    test("non-json response says JSON is not enabled", async () => {
        const url = serve(() => new Response("<html>oops</html>", { headers: { "content-type": "text/html" } }));
        await expect(new SearxngProvider(url).search("q", 5, signal())).rejects.toThrow(/JSON nahi/);
    });

    test("unreachable server is reported", async () => {
        const url = await deadUrl();
        await expect(new SearxngProvider(url).search("q", 5, signal())).rejects.toThrow(/not reachable/);
    });
});

describe("DuckDuckGoProvider", () => {
    test("parses redirect links, entities, ads and internal links", async () => {
        const html = await fixture("ddg-search.html");
        const results = await parseDuckDuckGo(html);

        expect(results.map((r) => r.url)).toEqual([
            "https://example.com/docs/",
            "https://www.example.com/docs/",
            "https://bun.sh/docs",
        ]);
        expect(results[0]).toEqual({
            title: "Example & Docs",
            url: "https://example.com/docs/",
            snippet: "Learn things \"fast\" & safely's.",
        });
        expect(results.some((r) => /Buy stuff|settings/.test(r.title))).toBe(false);
    });

    test("parses markup captured from the live DDG page", async () => {
        const results = await parseDuckDuckGo(await fixture("ddg-live.html"));

        expect(results).toHaveLength(2);
        expect(results[0]!.url).toBe("https://bun.sh/");
        expect(results[0]!.title).toBe("Bun — A fast all-in-one JavaScript runtime");
        expect(results[0]!.snippet).toContain("Bundle, install, and run JavaScript & TypeScript");
        expect(results[1]!.url).toBe("https://bun.com/docs/runtime");
        expect(results[1]!.snippet).toContain("Bun's fast runtime");
    });

    test("sends a browser user-agent", async () => {
        let ua = "";
        const url = serve((req) => {
            ua = req.headers.get("user-agent") ?? "";
            return new Response("<html><body>nothing</body></html>", { headers: { "content-type": "text/html" } });
        });

        await new DuckDuckGoProvider(url).search("q", 5, signal());
        expect(ua).toContain("Mozilla/5.0");
    });

    test("HTTP 202 is reported as rate limit / block", async () => {
        const url = serve(() => new Response("nope", { status: 202 }));
        await expect(new DuckDuckGoProvider(url).search("q", 5, signal())).rejects.toThrow(/HTTP 202/);
    });

    test("captcha page throws a clear error", async () => {
        const html = await fixture("ddg-blocked.html");
        const url = serve(() => new Response(html, { headers: { "content-type": "text/html" } }));
        await expect(new DuckDuckGoProvider(url).search("q", 5, signal())).rejects.toThrow(/captcha/);
    });

    test("empty page is an empty result, not an error", async () => {
        const url = serve(() => new Response("<html><body>no results</body></html>", { headers: { "content-type": "text/html" } }));
        expect(await new DuckDuckGoProvider(url).search("q", 5, signal())).toEqual([]);
    });

    test("respects limit*2", async () => {
        const html = await fixture("ddg-search.html");
        const url = serve(() => new Response(html, { headers: { "content-type": "text/html" } }));
        const results = await new DuckDuckGoProvider(url).search("q", 1, signal());
        expect(results).toHaveLength(2);
    });

    test("invalid numeric entities do not crash the parser", async () => {
        const results = await parseDuckDuckGo(`
            <div class="result">
              <a class="result__a" href="https://x.test">Bad &#99999999; &#xD800; entity</a>
              <div class="result__snippet">ok</div>
            </div>`);
        expect(results[0]?.title).toBe("Bad entity");
    });
});

describe("SearchEngine", () => {
    test("caches the same query (trim + case insensitive)", async () => {
        const provider = new FakeProvider("fake", () => [one]);
        const engine = new SearchEngine([provider]);

        expect((await engine.search("Bun")).cached).toBe(false);
        const second = await engine.search("  bun ");
        expect(second.cached).toBe(true);
        expect(second.results).toEqual([one]);
        expect(provider.hits).toBe(1);
    });

    test("cache expires after ttl", async () => {
        const provider = new FakeProvider("fake", () => [one]);
        const engine = new SearchEngine([provider], { cacheTtlMs: 20 });

        await engine.search("bun");
        await Bun.sleep(35);
        expect((await engine.search("bun")).cached).toBe(false);
        expect(provider.hits).toBe(2);
    });

    test("dedupes www, trailing slash, fragment and scheme", async () => {
        const urls = [
            "https://example.com/a/",
            "https://www.example.com/a",
            "http://example.com/a#frag",
            "https://example.com/b?x=1",
            "https://example.com/b?x=1#other",
        ];
        const provider = new FakeProvider("fake", () => urls.map((url, i) => ({ title: `R${i}`, url, snippet: "" })));
        const engine = new SearchEngine([provider], { limit: 10 });

        const { results } = await engine.search("q");
        expect(results.map((r) => r.url)).toEqual(["https://example.com/a/", "https://example.com/b?x=1"]);
    });

    test("applies limit after dedupe", async () => {
        const provider = new FakeProvider("fake", () =>
            Array.from({ length: 10 }, (_, i) => ({ title: `R${i}`, url: `https://x.test/${i}`, snippet: "" })),
        );
        const engine = new SearchEngine([provider], { limit: 3 });
        expect((await engine.search("q")).results).toHaveLength(3);
    });

    test("falls back when the first provider throws", async () => {
        const searxng = new FakeProvider("searxng", () => {
            throw new Error("boom");
        });
        const ddg = new FakeProvider("duckduckgo", () => [one]);
        const engine = new SearchEngine([searxng, ddg]);

        const res = await engine.search("q");
        expect(res.provider).toBe("duckduckgo");
        expect(res.results).toEqual([one]);
        expect(searxng.hits).toBe(1);
        expect(ddg.hits).toBe(1);
    });

    test("falls back when the first provider answers empty", async () => {
        const searxng = new FakeProvider("searxng", () => []);
        const ddg = new FakeProvider("duckduckgo", () => [one]);
        const res = await new SearchEngine([searxng, ddg]).search("q");
        expect(res.provider).toBe("duckduckgo");
        expect(res.results).toEqual([one]);
    });

    test("failed provider is skipped during cooldown", async () => {
        const searxng = new FakeProvider("searxng", () => {
            throw new Error("down");
        });
        const ddg = new FakeProvider("duckduckgo", () => [one]);
        const engine = new SearchEngine([searxng, ddg], { cooldownMs: 10_000 });

        await engine.search("one");
        await engine.search("two");
        expect(searxng.hits).toBe(1);
        expect(ddg.hits).toBe(2);
    });

    test("provider is retried after cooldown expires", async () => {
        const searxng = new FakeProvider("searxng", () => {
            throw new Error("down");
        });
        const ddg = new FakeProvider("duckduckgo", () => [one]);
        const engine = new SearchEngine([searxng, ddg], { cooldownMs: 15 });

        await engine.search("one");
        await Bun.sleep(25);
        await engine.search("two");
        expect(searxng.hits).toBe(2);
    });

    test("when everything is cooling down, providers are still tried", async () => {
        const searxng = new FakeProvider("searxng", () => {
            throw new Error("down");
        });
        const ddg = new FakeProvider("duckduckgo", () => {
            throw new Error("down too");
        });
        const engine = new SearchEngine([searxng, ddg], { cooldownMs: 10_000 });

        await expect(engine.search("one")).rejects.toThrow(/searxng: down/);
        await expect(engine.search("two")).rejects.toThrow(/duckduckgo: down too/);
        expect(searxng.hits).toBe(2);
        expect(ddg.hits).toBe(2);
    });

    test("empty from every provider is 'no results', not an error", async () => {
        const searxng = new FakeProvider("searxng", () => []);
        const ddg = new FakeProvider("duckduckgo", () => []);
        const res = await new SearchEngine([searxng, ddg]).search("q");
        expect(res).toEqual({ results: [], provider: "searxng", cached: false });
    });

    test("all failures produce one readable error", async () => {
        const searxng = new FakeProvider("searxng", () => {
            throw new Error("boom");
        });
        const ddg = new FakeProvider("duckduckgo", () => {
            throw new Error("down");
        });
        await expect(new SearchEngine([searxng, ddg]).search("q")).rejects.toThrow(
            /searxng: boom; duckduckgo: down/,
        );
    });

    test("empty query is rejected", async () => {
        await expect(new SearchEngine([new FakeProvider("fake", () => [one])]).search("   ")).rejects.toThrow(
            /query is empty/,
        );
    });

    test("integration: SearXNG 500 falls back to DuckDuckGo fixture", async () => {
        const searxngUrl = serve(() => new Response("boom", { status: 500 }));
        const html = await fixture("ddg-search.html");
        const ddgUrl = serve(() => new Response(html, { headers: { "content-type": "text/html" } }));

        const engine = new SearchEngine([new SearxngProvider(searxngUrl), new DuckDuckGoProvider(ddgUrl)]);
        const res = await engine.search("q");
        expect(res.provider).toBe("duckduckgo");
        expect(res.results.map((r) => r.url)).toEqual([
            "https://example.com/docs/",
            "https://bun.sh/docs",
        ]);
    });

    test("integration: unreachable SearXNG falls back to DuckDuckGo", async () => {
        const searxngUrl = await deadUrl();
        const html = await fixture("ddg-search.html");
        const ddgUrl = serve(() => new Response(html, { headers: { "content-type": "text/html" } }));

        const engine = new SearchEngine([new SearxngProvider(searxngUrl), new DuckDuckGoProvider(ddgUrl)]);
        expect((await engine.search("q")).provider).toBe("duckduckgo");
    });

    test("integration: hanging SearXNG times out and falls back", async () => {
        const searxngUrl = serve(() => new Promise<Response>(() => {}));
        const html = await fixture("ddg-search.html");
        const ddgUrl = serve(() => new Response(html, { headers: { "content-type": "text/html" } }));

        const engine = new SearchEngine([new SearxngProvider(searxngUrl), new DuckDuckGoProvider(ddgUrl)], {
            timeoutMs: 100,
        });
        const started = performance.now();
        const res = await engine.search("q");
        expect(res.provider).toBe("duckduckgo");
        expect(performance.now() - started).toBeLessThan(3_000);
    });
});

describe("WebSearchTool", () => {
    test("formats results for the model and shows provider/cache", async () => {
        const provider = new FakeProvider("fake", () => [
            { title: "Title", url: "https://x.test/page", snippet: "S".repeat(300) },
        ]);
        const tool = new WebSearchTool(new SearchEngine([provider]));

        const out = await tool.run({ query: "q" });
        expect(out).toContain("1. Title");
        expect(out).toContain("https://x.test/page");
        expect(out).toContain("(via fake)");
        expect(out.length).toBeLessThan(400); // snippet 200 chars pe cut hota hai

        expect(await tool.run({ query: "q" })).toContain("(via fake, cached)");
    });

    test("empty results become 'no results'", async () => {
        const tool = new WebSearchTool(new SearchEngine([new FakeProvider("fake", () => [])]));
        expect(await tool.run({ query: "q" })).toBe("no results");
    });
});
