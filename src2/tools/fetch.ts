import { ToolDefinition } from "./types";

/**
 * Strips HTML tags, scripts, and styles from raw HTML, returning clean readable text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

export const fetchUrlTool: ToolDefinition = {
  name: "fetch_url",
  description: "Fetch and read the content of a URL. Strips HTML for readability. Useful for reading documentation, READMEs, or public APIs.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch" },
      max_length: { type: "number", description: "Max characters to return (default 10000)" }
    },
    required: ["url"]
  },
  execute: async (input) => {
    const maxLength = input.max_length || 10000;

    try {
      const response = await fetch(input.url, {
        headers: { "User-Agent": "claude-clone/1.0 (agentic CLI)" },
        signal: AbortSignal.timeout(15000) // 15s timeout
      });

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText} for ${input.url}`;
      }

      const contentType = response.headers.get("content-type") || "";
      const raw = await response.text();

      let output: string;

      if (contentType.includes("application/json")) {
        try {
          const parsed = JSON.parse(raw);
          output = JSON.stringify(parsed, null, 2);
        } catch {
          output = raw;
        }
      } else if (contentType.includes("text/html")) {
        output = `[URL: ${input.url}]\n\n` + stripHtml(raw);
      } else {
        output = raw;
      }

      if (output.length > maxLength) {
        return output.substring(0, maxLength) + `\n\n...[TRUNCATED — ${output.length - maxLength} more characters]`;
      }

      return output;
    } catch (e: any) {
      if (e.name === "TimeoutError") {
        return `Error: Request to ${input.url} timed out after 15 seconds.`;
      }
      return `Error fetching ${input.url}: ${e.message}`;
    }
  }
};

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Search the web using DuckDuckGo (no API key needed) and get an instant answer summary.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" }
    },
    required: ["query"]
  },
  execute: async (input) => {
    try {
      const encodedQuery = encodeURIComponent(input.query);
      const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

      const response = await fetch(url, {
        headers: { "User-Agent": "claude-clone/1.0 (agentic CLI)" },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        return `Error: DuckDuckGo returned HTTP ${response.status}`;
      }

      const data = await response.json() as any;

      const parts: string[] = [];

      if (data.AbstractText) {
        parts.push(`**Summary**: ${data.AbstractText}`);
        if (data.AbstractURL) parts.push(`**Source**: ${data.AbstractURL}`);
      }

      if (data.Answer) {
        parts.push(`**Instant Answer**: ${data.Answer}`);
      }

      if (data.Definition) {
        parts.push(`**Definition**: ${data.Definition}`);
      }

      if (data.RelatedTopics?.length > 0) {
        const topics = data.RelatedTopics
          .slice(0, 5)
          .filter((t: any) => t.Text)
          .map((t: any) => `- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);

        if (topics.length > 0) {
          parts.push(`\n**Related Topics**:\n${topics.join("\n")}`);
        }
      }

      if (parts.length === 0) {
        return `No instant answer found for "${input.query}". Try fetching a specific URL with fetch_url instead.`;
      }

      return parts.join("\n\n");
    } catch (e: any) {
      if (e.name === "TimeoutError") {
        return `Error: Web search timed out.`;
      }
      return `Error searching the web: ${e.message}`;
    }
  }
};
