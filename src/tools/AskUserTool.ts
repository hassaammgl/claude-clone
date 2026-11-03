import { Tool } from "./Tool";

/** UI se user ka jawab lene wala callback (Tui.ask) */
export type Asker = (question: string, options?: string[]) => Promise<string>;

/**
 * Model ko guess karne ke bajaye user se poochne deta hai.
 * Ye tool kabhi block nahi karta: jawab khali ho to bhi text wapas jata hai.
 */
export class AskUserTool extends Tool {
    name = "ask_user";
    description =
        "Ask the user a question when the request is ambiguous or a decision is theirs (not yours). " +
        "Blocks until they answer. Use options for a small choice, or leave it out for free text.";
    parameters = {
        type: "object",
        properties: {
            question: { type: "string", description: "Short, specific question" },
            options: { type: "array", items: { type: "string" }, description: "Optional choices to pick from" },
        },
        required: ["question"],
    };

    constructor(private ask: Asker) {
        super();
    }

    async run({ question, options }: Record<string, any>) {
        const q = String(question ?? "").trim();
        if (!q) throw new Error("question is empty");
        const choices = Array.isArray(options) ? options.map((o: any) => String(o)).filter(Boolean) : [];
        const answer = String((await this.ask(q, choices)) ?? "").trim();
        return answer || "(user gave no answer)";
    }
}
