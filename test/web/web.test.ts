import { afterEach, describe, expect, test } from "bun:test";
import { WebFetchTool, decodeEntities, htmlToText } from "../../src/tools/WebTools";

const servers: { stop(force?: boolean): unknown }[] = [];

function serve(handler: (req: Request) => Response | Promise<Response>) {
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: handler });
    servers.push(server);
    return `http://127.0.0.1:${server.port}`;
}

afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => s.stop(true)));
});

const html = (body: string) => new Response(`<html><head><title>Example &amp; Co</title></head><body>${body}</body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
});

describe("htmlToText", () => {
    test("drops head/script/style and keeps readable blocks", () => {
        const text = htmlToText(`
            <html><head><title>T</title><style>.x{color:red}</style></head>
            <body>
              <script>alert("never")</script>
              <h1>Hello &amp; welcome</h1>
              <p>First&nbsp;line<br>second line</p>
              <div>Last <b>one</b></div>
            </body></html>`);

        expect(text).toBe("Hello & welcome\nFirst line\nsecond line\nLast one");
        expect(text).not.toContain("never");
        expect(text).not.toContain("color:red");
    });

    test("keeps img alt text", () => {
        expect(htmlToText(`<p>See <img src="cat.png" alt="a cat"> here</p>`)).toBe("See a cat here");
    });

    test("decodes named and numeric entities once", () => {
        expect(decodeEntities("&amp;lt; &mdash; &#65; &#x42; &unknown;")).toBe("&lt; — A B &unknown;");
    });

    test("invalid numeric entities become empty, not a crash", () => {
        expect(decodeEntities("x&#99999999;y&#xD800;z")).toBe("xyz");
    });
});

describe("WebFetchTool", () => {
    test("fetches html as title + readable text", async () => {
        const url = serve(() =>
            html(`<h1>Docs</h1><p>Bun &amp; HTMLRewriter</p><script>secret()</script>`),
        );

        const out = await new WebFetchTool().run({ url: `${url}/page` });
        expect(out).toContain("# Example & Co");
        expect(out).toContain(`URL: ${url}/page`);
        expect(out).toContain("Docs\nBun & HTMLRewriter");
        expect(out).not.toContain("secret()");
    });

    test("returns non-html bodies raw", async () => {
        const url = serve(() =>
            new Response('{"ok":true}', { headers: { "content-type": "application/json" } }),
        );

        const out = await new WebFetchTool().run({ url });
        expect(out).toContain("URL:");
        expect(out).toContain('{"ok":true}');
    });

    test("follows redirects and reports the final URL", async () => {
        const url = serve((req) => {
            const path = new URL(req.url).pathname;
            if (path === "/old") return Response.redirect(`${url}/new`, 302);
            return html(`<p>moved</p>`);
        });

        const out = await new WebFetchTool().run({ url: `${url}/old` });
        expect(out).toContain(`URL: ${url}/new`);
        expect(out).toContain("moved");
    });

    test("HTTP errors are clear", async () => {
        const url = serve(() => new Response("missing", { status: 404 }));
        await expect(new WebFetchTool().run({ url })).rejects.toThrow(/HTTP 404/);
    });

    test("rejects empty, invalid and non-http URLs", async () => {
        const tool = new WebFetchTool();
        await expect(tool.run({ url: "  " })).rejects.toThrow(/url is empty/);
        await expect(tool.run({ url: "not a url" })).rejects.toThrow(/invalid url/);
        await expect(tool.run({ url: "file:///etc/passwd" })).rejects.toThrow(/only http and https/);
    });

    test("reports timeouts", async () => {
        const url = serve(() => new Promise<Response>(() => {}));
        await expect(new WebFetchTool(100).run({ url })).rejects.toThrow(/timed out/);
    });

    test("rejects unsupported binary content types", async () => {
        const url = serve(() => new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } }));
        await expect(new WebFetchTool().run({ url })).rejects.toThrow(/unsupported content type: application\/pdf/);
    });

    test("truncates long pages in the middle", async () => {
        const words = Array.from({ length: 5_000 }, (_, i) => `word${i}`).join(" ");
        const url = serve(() => html(`<p>${words}</p>`));

        const out = await new WebFetchTool().run({ url });
        expect(out).toContain("chars truncated");
        expect(out.length).toBeLessThan(9_000);
        expect(out).toContain("word0");
        expect(out).toContain("word4999");
    });
});
