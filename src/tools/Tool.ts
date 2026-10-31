import type { Tool as OllamaTool } from "ollama";

export abstract class Tool {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly parameters: Record<string, any>;
    readonly dangerous: boolean = false;

    abstract run(args: Record<string, any>): Promise<string>;

    /** Per-action danger: kuch tools (jaise bash status/wait) safe hote hain. */
    dangerousFor(_args: Record<string, any>): boolean {
        return this.dangerous;
    }

    /** Risky cheezon ki list. Khali nahi hai to Agent double confirmation maangta hai. */
    warnings(_args: Record<string, any>): string[] {
        return [];
    }

    /** Optional: confirm se pehle dikhne wala preview. */
    preview?(args: Record<string, any>): string | Promise<string>;

    toOllama(): OllamaTool {
        return {
            type: "function",
            function: { name: this.name, description: this.description, parameters: this.parameters as any },
        };
    }
}