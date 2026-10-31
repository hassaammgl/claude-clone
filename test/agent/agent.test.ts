import { describe, expect, test } from "bun:test";
import { Agent, type AgentUI } from "../../src/agent/Agent";

function makeUi(warnings: string[]): AgentUI {
    return {
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
}

describe("Agent model timeout", () => {
    test("retries the request with half context when the model times out before output", async () => {
        const contexts: number[] = [];
        const warnings: string[] = [];
        let calls = 0;

        const ollama = {
            async chat(req: any) {
                calls++;
                contexts.push(req.options.num_ctx);
                if (calls === 1) throw new Error("The operation timed out.");
                return (async function* () {
                    yield { message: { content: "ok" }, done: true, done_reason: "stop" };
                })();
            },
        } as any;

        await new Agent(ollama, "fake", makeUi(warnings), process.cwd()).run("hi");

        expect(contexts).toEqual([32_768, 16_384]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("retrying with num_ctx=16384");
    });

    test("does not retry after partial output was already shown", async () => {
        const warnings: string[] = [];
        let calls = 0;

        const ollama = {
            async chat() {
                calls++;
                return (async function* () {
                    yield { message: { content: "half" } };
                    throw new Error("The operation timed out.");
                })();
            },
        } as any;

        await expect(new Agent(ollama, "fake", makeUi(warnings), process.cwd()).run("hi")).rejects.toThrow(/timed out/);
        expect(calls).toBe(1);
        expect(warnings).toHaveLength(0);
    });
});
