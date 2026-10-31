import { SearchProvider, type SearchResult } from "./SearchProvider";

/** Tumhara apna SearXNG. settings.yml me `search.formats` me `json` enable hona chahiye. */
export class SearxngProvider extends SearchProvider {
    readonly name = "searxng";

    constructor(private baseUrl: string) {
        super();
    }

    async search(query: string, limit: number, signal: AbortSignal): Promise<SearchResult[]> {
        const url = `${this.baseUrl.replace(/\/$/, "")}/search?format=json&q=${encodeURIComponent(query)}`;
        let res: Response;
        try {
            res = await fetch(url, { signal });
        } catch {
            throw new Error(signal.aborted ? "timed out" : `not reachable at ${this.baseUrl}`);
        }
        if (res.status === 403) throw new Error("403: settings.yml me search.formats me `json` enable karo");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let data: { results?: { title?: string; url?: string; content?: string }[] };
        try {
            data = (await res.json()) as typeof data;
        } catch {
            throw new Error("response JSON nahi hai (format=json enable hai?)");
        }

        const rows = Array.isArray(data?.results) ? data.results : [];
        return rows
            .filter((r) => r.url && r.title)
            .slice(0, limit * 2) // dedupe ke baad limit lagegi
            .map((r) => ({ title: r.title!, url: r.url!, snippet: (r.content ?? "").trim() }));
    }
}