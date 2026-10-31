import type { SearchProvider, SearchResult } from "./SearchProvider";

export interface SearchResponse {
    results: SearchResult[];
    provider: string;
    cached: boolean;
}

export interface SearchEngineOptions {
    limit?: number; // default 5
    timeoutMs?: number; // har provider ke liye, default 10s
    cacheTtlMs?: number; // default 5 min
    cooldownMs?: number; // fail hone wala provider itni der skip, default 60s
}

const MAX_CACHE = 100;

/**
 * Providers ko order me try karta hai: pehla jo results de wahi jeet-ta hai.
 * Extra: cache, duplicate URL hatana, aur fail hone wale provider ko thodi der skip karna
 * (SearXNG band ho to har query pe timeout nahi bharna padta).
 */
export class SearchEngine {
    private cache = new Map<string, { at: number; value: SearchResponse }>();
    private retryAt = new Map<string, number>();
    private limit: number;
    private timeoutMs: number;
    private cacheTtlMs: number;
    private cooldownMs: number;

    constructor(private providers: SearchProvider[], opts: SearchEngineOptions = {}) {
        this.limit = opts.limit ?? 5;
        this.timeoutMs = opts.timeoutMs ?? 10_000;
        this.cacheTtlMs = opts.cacheTtlMs ?? 5 * 60_000;
        this.cooldownMs = opts.cooldownMs ?? 60_000;
    }

    async search(query: string): Promise<SearchResponse> {
        const q = query.trim();
        if (!q) throw new Error("query is empty");

        const key = q.toLowerCase();
        const hit = this.cache.get(key);
        if (hit && Date.now() - hit.at < this.cacheTtlMs) return { ...hit.value, cached: true };

        const now = Date.now();
        let candidates = this.providers.filter((p) => (this.retryAt.get(p.name) ?? 0) <= now);
        if (!candidates.length) candidates = this.providers; // sab cooldown me hain to bhi try karo

        const errors: string[] = [];
        let answeredEmpty: string | undefined;

        for (const p of candidates) {
            try {
                const raw = await p.search(q, this.limit, AbortSignal.timeout(this.timeoutMs));
                const results = dedupe(raw).slice(0, this.limit);
                if (!results.length) {
                    answeredEmpty ??= p.name;
                    continue; // is provider ke paas kuch nahi, agla try karo
                }
                const value: SearchResponse = { results, provider: p.name, cached: false };
                this.remember(key, value);
                return value;
            } catch (e) {
                this.retryAt.set(p.name, Date.now() + this.cooldownMs);
                errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // kisi ne jawab diya (khali), to ye "no results" hai, error nahi
        if (answeredEmpty) return { results: [], provider: answeredEmpty, cached: false };
        throw new Error(`saare search providers fail hue (${errors.join("; ")})`);
    }

    private remember(key: string, value: SearchResponse) {
        if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { at: Date.now(), value });
    }
}

/** Same page ke alag URLs (trailing slash, #fragment) ek hi gine jayein */
function dedupe(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter((r) => {
        let k = r.url;
        try {
            const u = new URL(r.url);
            k = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`.toLowerCase();
        } catch { }
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}