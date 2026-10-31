import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Tool } from "../tools/Tool";

/** MCP server ka har tool ek normal Tool ban jata hai */
class McpTool extends Tool {
    override dangerous = true;
    constructor(
        private client: Client,
        private remoteName: string,
        public name: string,
        public description: string,
        public parameters: Record<string, any>,
    ) {
        super();
    }
    async run(args: Record<string, any>) {
        const res: any = await this.client.callTool({ name: this.remoteName, arguments: args });
        const text = (res.content ?? []).map((c: any) => c.text ?? `[${c.type}]`).join("\n");
        if (res.isError) throw new Error(text);
        return text;
    }
}

export class McpManager {
    private clients: Client[] = [];

    /** mcp.json se enabled servers connect karo aur unke tools return karo */
    async load(configPath: string): Promise<Tool[]> {
        const file = Bun.file(configPath);
        if (!(await file.exists())) return [];
        const { servers = {} } = await file.json();

        const tools: Tool[] = [];
        for (const [server, cfg] of Object.entries<any>(servers)) {
            if (cfg.disabled) continue;
            try {
                const client = new Client({ name: "mini-code", version: "0.1.0" });
                await client.connect(
                    new StdioClientTransport({ command: cfg.command, args: cfg.args ?? [], env: { ...process.env, ...cfg.env } as any }),
                );
                this.clients.push(client);
                for (const t of (await client.listTools()).tools) {
                    tools.push(
                        new McpTool(client, t.name, `${server}__${t.name}`, t.description ?? t.name, t.inputSchema as any),
                    );
                }
            } catch (e: any) {
                console.log(`  MCP '${server}' failed: ${e.message}`);
            }
        }
        return tools;
    }

    close() {
        return Promise.allSettled(this.clients.map((c) => c.close()));
    }
}