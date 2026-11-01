import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, type AgentUI } from "../../src/agent/Agent";
import { formatLogLine, SessionLogger, type AgentLog } from "../../src/log/SessionLogger";
import { Tool } from "../../src/tools/Tool";

const tempDirs: string[] = [];

async function tempRoot() {
    const dir = await mkdtemp(join(tmpdir(), "noni-log-"));
    tempDirs.push(dir);
    return dir;
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function readEvents(path: string) {
    const text = await Bun.file(path).text();
    return text
        .trimEnd()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

describe("SessionLogger", () => {
    test("keeps events in memory by default and writes no files", async () => {
        const root = await tempRoot();
        const logger = new SessionLogger(root, { dir: join(root, "logs") });
        logger.input("hello");
        logger.toolCall("bash", { command: "ls" });
        await logger.flush();

        expect(logger.path).toBe("");
        expect(logger.writesFile).toBe(false);
        expect(existsSync(join(root, "logs"))).toBe(false);
        expect(logger.count).toBe(2);

        const lines = await logger.tail(10);
        expect(lines[0]).toContain("input text=hello");
        expect(lines[1]).toContain("tool_call name=bash");
    });

    test("streams every event to the live callback as a readable line", async () => {
        const lines: string[] = [];
        const types: string[] = [];
        const logger = new SessionLogger(await tempRoot(), {
            onEvent: (line, event) => {
                lines.push(line);
                types.push(event.type);
            },
        });

        logger.event("model_request", { model: "qwen3.5:0.8b", num_ctx: 8_192 });
        logger.event("guard_block", { tool: "write_file", reason: "zod docs missing" });

        expect(types).toEqual(["model_request", "guard_block"]);
        expect(lines[0]).toContain("model_request");
        expect(lines[0]).toContain("num_ctx=8192");
        expect(lines[1]).toContain("guard_block");
    });

    test("writes JSONL only when file mode is on", async () => {
        const root = await tempRoot();
        const logger = new SessionLogger(root, { file: true, dir: join(root, "logs") });
        logger.sessionStart("qwen3.5:0.8b", 13);
        logger.input("hello");
        logger.toolCall("bash", { command: "ls" });
        logger.toolResult("bash", "a\nb", false);
        logger.toolResult("edit_file", "blocked", true);
        logger.assistant("hi there", "thinking");
        logger.model("qwen3.5:2b");
        logger.error("boom");
        logger.sessionEnd();
        await logger.flush();

        expect(logger.writesFile).toBe(true);
        const events = await readEvents(logger.path);
        expect(events.map((e) => e.type)).toEqual([
            "session_start",
            "input",
            "tool_call",
            "tool_result",
            "tool_error",
            "assistant",
            "model",
            "error",
            "session_end",
        ]);
        expect(events[0].cwd).toBe(root);
        expect(events[1].text).toBe("hello");
        expect(events[2].args.command).toBe("ls");
        expect(events[5].content).toBe("hi there");
        expect(events[5].thinking).toBe("thinking");
        expect(logger.path.startsWith(join(root, "logs"))).toBe(true);
    });

    test("truncates huge tool output", async () => {
        const logger = new SessionLogger(await tempRoot(), { file: true });
        logger.toolResult("read_file", "x".repeat(25_000), false);
        await logger.flush();

        const [event] = await readEvents(logger.path);
        expect(event.result.length).toBeLessThan(21_000);
        expect(event.result).toContain("truncated");
    });

    test("tail returns readable recent lines", async () => {
        const logger = new SessionLogger(await tempRoot());
        logger.input("one");
        logger.input("two");
        logger.input("three");
        await logger.flush();

        const lines = await logger.tail(2);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain("input text=two");
        expect(lines[1]).toContain("input text=three");
    });

    test("keeps the memory buffer bounded", async () => {
        const logger = new SessionLogger(await tempRoot(), { limit: 20 });
        for (let i = 0; i < 60; i++) logger.input(`m${i}`);

        expect(logger.count).toBe(20);
        const lines = await logger.tail(20);
        expect(lines[0]).toContain("input text=m40");
        expect(lines[19]).toContain("input text=m59");
    });

    test("writes commands and generic agent/model events", async () => {
        const logger = new SessionLogger(await tempRoot(), { file: true });
        logger.command("/model qwen3.5:2b");
        logger.event("model_request", { model: "qwen3.5:2b", num_ctx: 32_768, tools: 13 });
        logger.event("guard_block", { tool: "write_file", reason: "zod docs missing" });
        await logger.flush();

        const events = await readEvents(logger.path);
        expect(events.map((e) => e.type)).toEqual(["command", "model_request", "guard_block"]);
        expect(events[1].num_ctx).toBe(32_768);
        expect(events[2].tool).toBe("write_file");
    });

    test("formatLogLine handles broken JSON", () => {
        expect(formatLogLine("not json")).toBe("not json");
    });
});

describe("Agent logging", () => {
    test("logs tool calls/results, model events and the final assistant message", async () => {
        const events: string[] = [];
        const types: string[] = [];
        let toolDuration: number | undefined;
        const logger: AgentLog = {
            assistant(content) {
                events.push(`assistant:${content}`);
            },
            toolCall(name) {
                events.push(`call:${name}`);
            },
            toolResult(name, _result, isError, durationMs) {
                events.push(`result:${name}:${isError}`);
                toolDuration = durationMs;
            },
            error(message) {
                events.push(`error:${message}`);
            },
            event(type) {
                types.push(type);
            },
        };

        let calls = 0;
        const ollama = {
            async chat() {
                calls++;
                const parts =
                    calls === 1
                        ? [{ message: { content: "", tool_calls: [{ function: { name: "write_file", arguments: { path: "a.txt", content: "x" } } }] } }]
                        : [{ message: { content: "done" } }];
                return (async function* () {
                    for (const part of parts) yield part;
                })();
            },
        } as any;

        class FakeWrite extends Tool {
            name = "write_file";
            description = "";
            parameters = {};
            async run() {
                return "wrote a.txt";
            }
        }

        const ui: AgentUI = {
            assistantStart() {},
            assistantDelta() {},
            assistantEnd() {},
            toolCall() {},
            toolResult() {},
            async confirm() {
                return true;
            },
            async confirmStrict() {
                return true;
            },
        };

        const agent = new Agent(ollama, "fake", ui, process.cwd());
        agent.addLogger(logger);
        agent.addTools(new FakeWrite());
        await agent.run("write it");

        expect(events).toEqual(["call:write_file", "result:write_file:false", "assistant:done"]);
        expect(toolDuration).toBeGreaterThanOrEqual(0);
        expect(types).toEqual(
            expect.arrayContaining(["agent_start", "model_request", "model_response", "agent_end"]),
        );
    });

    test("logs a failing tool as an error result", async () => {
        const events: string[] = [];
        const logger: AgentLog = {
            assistant() {},
            toolCall() {},
            toolResult(name, _result, isError) {
                events.push(`${name}:${isError}`);
            },
            error() {},
        };

        let calls = 0;
        const ollama = {
            async chat() {
                calls++;
                const parts =
                    calls === 1
                        ? [{ message: { tool_calls: [{ function: { name: "explode", arguments: {} } }] } }]
                        : [{ message: { content: "ok" } }];
                return (async function* () {
                    for (const part of parts) yield part;
                })();
            },
        } as any;

        class Explode extends Tool {
            name = "explode";
            description = "";
            parameters = {};
            async run(): Promise<string> {
                throw new Error("bad");
            }
        }

        const ui: AgentUI = {
            assistantStart() {},
            assistantDelta() {},
            assistantEnd() {},
            toolCall() {},
            toolResult() {},
            async confirm() {
                return true;
            },
            async confirmStrict() {
                return true;
            },
        };

        const agent = new Agent(ollama, "fake", ui, process.cwd());
        agent.addLogger(logger);
        agent.addTools(new Explode());
        await agent.run("go");

        expect(events).toEqual(["explode:true"]);
    });
});
