export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

/**
 * Har search backend (SearXNG, DuckDuckGo, kal ko Brave...) is class ko extend karta hai.
 * Provider sirf apna kaam karta hai: query bhejo, results lo. Fallback/cache SearchEngine sambhalta hai.
 * Fail hone par Error throw karo (message chhota aur saaf rakho, user ko dikhega).
 */
export abstract class SearchProvider {
    abstract readonly name: string;
    abstract search(query: string, limit: number, signal: AbortSignal): Promise<SearchResult[]>;
}

