import { describe, expect, test } from "bun:test";
import { Agent, type AgentUI } from "../../src/agent/Agent";
import { normalizeTree, parseOutline, TodoStore } from "../../src/todos/TodoStore";
import { TodoTool } from "../../src/tools/TodoTool";

describe("normalizeTree", () => {
    test("accepts strings, single objects, name/children aliases and JSON", () => {
        expect(normalizeTree(["A", { title: "B" }])).toEqual([{ title: "A" }, { title: "B", notes: undefined, subtasks: undefined }]);

        expect(normalizeTree({ name: "Root", children: [{ title: "Child" }] })[0]).toEqual({
            title: "Root",
            notes: undefined,
            subtasks: [{ title: "Child", notes: undefined, subtasks: undefined }],
        });

        expect(normalizeTree('[{"title":"From JSON"}]')[0]).toEqual({
            title: "From JSON",
            notes: undefined,
            subtasks: undefined,
        });
    });

    test("rejects empty and title-less tasks", () => {
        expect(() => normalizeTree([])).toThrow(/empty/);
        expect(() => normalizeTree([{ notes: "x" }])).toThrow(/missing title/);
    });

    test("parses indented outlines into a tree", () => {
        expect(parseOutline("1. Build\n  1.1 API\n  1.2 UI\n2. Test")).toEqual([
            {
                title: "Build",
                subtasks: [
                    { title: "API", notes: undefined, subtasks: undefined },
                    { title: "UI", notes: undefined, subtasks: undefined },
                ],
            },
            { title: "Test" },
        ]);

        // Numbering bina indent ke bhi depth batati hai
        expect(parseOutline("1. A\n1.1 A1\n1.1.1 Deep\n2. B")[0]!.subtasks![0]!.subtasks![0]!.title).toBe("Deep");

        // Bullet + indentation
        expect(parseOutline("- A\n  - A1\n- B")).toEqual([
            { title: "A", subtasks: [{ title: "A1" }] },
            { title: "B" },
        ]);

        // Rendered-tree markers copy ho jayein to title saaf rahe
        expect(parseOutline("1.1 [ ] HTML")[0]!.title).toBe("HTML");
    });

    test("normalizes an outline string too", () => {
        expect(normalizeTree("1. A\n  1.1 A1")[0]!.subtasks![0]!.title).toBe("A1");
    });
});

describe("TodoStore", () => {
    test("builds a recursive plan with hierarchical ids", () => {
        const store = new TodoStore();
        store.add({
            title: "Build app",
            subtasks: [
                { title: "Backend" },
                { title: "Frontend", subtasks: [{ title: "Login page" }, { title: "Dashboard" }] },
            ],
        });

        expect(store.size).toBe(5);
        expect(store.get("1").title).toBe("Build app");
        expect(store.get("1.2.1").title).toBe("Login page");
        expect(store.get("1.2.1").parentId).toBe("1.2");
        expect(store.render()).toContain("1.2.1 [ ] Login page");
        expect(store.render()).toContain("0/5 done");
    });

    test("next walks leaves in order and marks them in_progress", () => {
        const store = new TodoStore();
        store.add({ title: "A", subtasks: [{ title: "A1" }, { title: "A2" }] });
        store.add({ title: "B" });

        expect(store.next()?.id).toBe("1.1");
        store.setStatus("1.1", "in_progress");
        expect(store.get("1.1").status).toBe("in_progress");
        expect(store.get("1").status).toBe("in_progress");

        store.setStatus("1.1", "done");
        expect(store.next()?.id).toBe("1.2");
    });

    test("completes parents when all children are done, and reopens them if a child reopens", () => {
        const store = new TodoStore();
        store.add({ title: "Root", subtasks: [{ title: "One" }, { title: "Two" }] });

        store.setStatus("1.1", "done");
        expect(store.get("1").status).toBe("in_progress");
        store.setStatus("1.2", "done");
        expect(store.get("1").status).toBe("done");
        expect(store.next()).toBeUndefined();

        store.setStatus("1.1", "in_progress");
        expect(store.get("1").status).toBe("in_progress");
        expect(store.next()?.id).toBe("1.1");
    });

    test("skips blocked leaves but keeps them visible", () => {
        const store = new TodoStore();
        store.add({ title: "A" });
        store.add({ title: "B" });

        store.setStatus("1", "blocked");
        expect(store.next()?.id).toBe("2");
        expect(store.render()).toContain("1 [!] A");
    });

    test("update changes title, notes and status", () => {
        const store = new TodoStore();
        store.add("Old");

        store.update("1", { title: "New", notes: "detail", status: "in_progress" });
        const todo = store.get("1");
        expect(todo.title).toBe("New");
        expect(todo.notes).toBe("detail");
        expect(todo.status).toBe("in_progress");

        store.update("1", { notes: "" });
        expect(store.get("1").notes).toBeUndefined();
        expect(() => store.update("1", { status: "nope" as any })).toThrow(/invalid status/);
    });

    test("removes a whole subtree and does not reuse its ids", () => {
        const store = new TodoStore();
        store.add({ title: "Root", subtasks: [{ title: "A" }, { title: "B" }] });

        expect(store.remove("1.1")).toBe(1);
        expect(store.has("1.1")).toBe(false);
        expect(store.size).toBe(2);

        store.add("C", "1");
        expect(store.get("1.3").title).toBe("C");
        expect(store.remove("1")).toBe(3);
        expect(store.size).toBe(0);
    });

    test("clear empties the plan and render is capped", () => {
        const store = new TodoStore();
        expect(store.render()).toBe("(no tasks)");

        for (let i = 0; i < 20; i++) store.add(`Task ${i} ${"x".repeat(50)}`);
        expect(store.render(200)).toContain("truncated");

        store.clear();
        expect(store.size).toBe(0);
        expect(store.render()).toBe("(no tasks)");
    });
});

describe("TodoTool", () => {
    test("plans, iterates next/done, and adds discovered subtasks", async () => {
        const store = new TodoStore();
        const tool = new TodoTool(store);

        const plan = await tool.run({
            action: "plan",
            tasks: [{ title: "Build", subtasks: [{ title: "API" }, { title: "UI" }] }],
        });
        expect(plan).toContain("Plan saved");
        expect(plan).toContain("1.1 [ ] API");

        const next = await tool.run({ action: "next" });
        expect(next).toContain('Next: 1.1 "API"');
        expect(store.get("1.1").status).toBe("in_progress");

        const done = await tool.run({ action: "done", id: "1.1" });
        expect(done).toContain('Done 1.1 "API"');

        const added = await tool.run({ action: "add", parent_id: "1", title: "Tests" });
        expect(added).toContain('Added 1.3 "Tests"');

        const updated = await tool.run({ action: "update", id: "1.3", status: "blocked", notes: "waiting" });
        expect(updated).toContain("(blocked)");

        const list = await tool.run({ action: "list" });
        expect(list).toContain("1.3 [!] Tests");
        expect(list).toContain("waiting");
    });

    test("accepts an indented outline, and infers plan from the shape", async () => {
        const tool = new TodoTool(new TodoStore());
        const out = await tool.run({ outline: "1. Build\n  1.1 API\n  1.2 UI" });
        expect(out).toContain("Plan saved (3 tasks)");
        expect(out).toContain("1.2 [ ] UI");

        await expect(tool.run({ action: "plan" })).rejects.toThrow(/needs `outline`/);
        await expect(tool.run({ action: "plan", outline: "1. New" })).rejects.toThrow(/already exists/);
        expect(await tool.run({ action: "plan", outline: "1. New", replace: true })).toContain("Plan saved (1 tasks)");
    });

    test("clear and remove work, and bad input gives clear errors", async () => {
        const tool = new TodoTool(new TodoStore());
        await tool.run({ action: "plan", tasks: [{ title: "A" }] });

        await expect(tool.run({ action: "done" })).rejects.toThrow(/id is required/);
        await expect(tool.run({ action: "update", id: "1" })).rejects.toThrow(/needs status/);
        await expect(tool.run({ action: "nope" })).rejects.toThrow(/unknown action/);
        await expect(tool.run({ action: "add" })).rejects.toThrow(/needs `title`/);
        await expect(tool.run({ action: "done", id: "9.9" })).rejects.toThrow(/unknown task id/);

        expect(await tool.run({ action: "remove", id: "1" })).toContain("Removed 1 task");
        expect(await tool.run({ action: "next" })).toContain("No tasks yet");
        await tool.run({ action: "plan", tasks: ["B"] });
        expect(await tool.run({ action: "clear" })).toContain("cleared");
        expect(await tool.run({ action: "list" })).toBe("(no tasks)");
    });
});

describe("Agent plan context", () => {
    test("injects the current todo plan into the system prompt", async () => {
        const requests: any[] = [];
        const ollama = {
            async chat(req: any) {
                requests.push(req);
                return (async function* () {
                    yield { message: { content: "ok" } };
                })();
            },
        } as any;

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

        const store = new TodoStore();
        store.add({ title: "Ship it", subtasks: [{ title: "Write tests" }] });

        const agent = new Agent(ollama, "fake", ui, process.cwd());
        agent.addContext(() => store.render(6_000));
        await agent.run("status?");

        const system = requests[0].messages[0].content as string;
        expect(system).toContain("## Current plan (live)");
        expect(system).toContain("1.1 [ ] Write tests");
    });
});
