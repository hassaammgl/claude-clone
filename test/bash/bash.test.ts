import { afterEach, describe, expect, test } from "bun:test";
import { JobManager } from "../../src/jobs/JobManager";
import { BashTool, timeoutFor } from "../../src/tools/BashTool";

const managers: JobManager[] = [];

function makeTool() {
    const jobs = new JobManager();
    managers.push(jobs);
    return { jobs, tool: new BashTool(process.cwd(), jobs) };
}

afterEach(async () => {
    await Promise.all(managers.splice(0).map((jobs) => jobs.closeAll()));
});

describe("BashTool timeout", () => {
    test("default grace is 30s, explicit values are clamped to 600", () => {
        expect(timeoutFor()).toBe(30);
        expect(timeoutFor(45)).toBe(45);
        expect(timeoutFor(9999)).toBe(600);
        expect(timeoutFor(0)).toBe(30);
        expect(timeoutFor("abc")).toBe(30);
        expect(timeoutFor(undefined, 120)).toBe(120);
    });

    test("preview and danger depend on the action", async () => {
        const { tool } = makeTool();
        expect(await tool.preview!({ action: "run", command: "cargo build" })).toContain("background after 30s");
        expect(await tool.preview!({ action: "start", command: "cargo build" })).toContain("starts in background");
        expect(await tool.preview!({ action: "kill", job_id: "1" })).toBe("kill job 1");

        expect(tool.dangerousFor({ action: "run" })).toBe(true);
        expect(tool.dangerousFor({ action: "start" })).toBe(true);
        expect(tool.dangerousFor({ action: "kill" })).toBe(true);
        expect(tool.dangerousFor({ action: "wait" })).toBe(false);
        expect(tool.dangerousFor({ action: "status" })).toBe(false);
        expect(tool.dangerousFor({ action: "jobs" })).toBe(false);
    });
});

describe("BashTool background jobs", () => {
    test("short commands finish in the foreground", async () => {
        const { jobs, tool } = makeTool();
        const out = await tool.run({ command: 'echo "hello"' });

        expect(out).toContain("hello");
        const [job] = jobs.list();
        expect(job!.status).toBe("done");
    });

    test("timeout moves the process to background and wait finishes it", async () => {
        const { jobs, tool } = makeTool();
        const out = await tool.run({ command: "echo start; sleep 1.5; echo end", timeout_seconds: 1 });

        expect(out).toContain("moved to the background, NOT killed");
        const id = /Job (\d+)/.exec(out)?.[1]!;
        expect(jobs.get(id).status).toBe("running");

        const waited = await tool.run({ action: "wait", job_id: id, timeout_seconds: 5 });
        expect(waited).toContain("start");
        expect(waited).toContain("end");
        expect(jobs.get(id).status).toBe("done");
    });

    test("wait returns still-running with a tail when the job needs longer", async () => {
        const { jobs, tool } = makeTool();
        const out = await tool.run({ command: "echo first; sleep 3; echo second", timeout_seconds: 1 });
        const id = /Job (\d+)/.exec(out)?.[1]!;

        const waited = await tool.run({ action: "wait", job_id: id, timeout_seconds: 1 });
        expect(waited).toContain("still running");
        expect(waited).toContain("first");

        await tool.run({ action: "wait", job_id: id, timeout_seconds: 5 });
        expect(jobs.get(id).status).toBe("done");
    });

    test("start/status/jobs/kill work", async () => {
        const { jobs, tool } = makeTool();
        const started = await tool.run({ action: "start", command: "sleep 5" });
        const id = /Job (\d+)/.exec(started)?.[1]!;

        expect(await tool.run({ action: "status", job_id: id })).toContain(`job ${id} running`);
        expect(await tool.run({ action: "jobs" })).toContain(`job ${id} running`);
        expect(await tool.run({ action: "kill", job_id: id })).toContain(`Killed job ${id}`);
        expect(jobs.get(id).status).toBe("killed");
    });

    test("missing command/job id gives a clear error", async () => {
        const { tool } = makeTool();
        await expect(tool.run({ action: "run", command: "  " })).rejects.toThrow(/command is empty/);
        await expect(tool.run({ action: "wait" })).rejects.toThrow(/job_id is required/);
        await expect(tool.run({ action: "status", job_id: "999" })).rejects.toThrow(/unknown job id/);
    });

    test("list/list_dir are redirected to the right tools", async () => {
        const { tool } = makeTool();
        await expect(tool.run({ action: "list" })).rejects.toThrow(/For background jobs use action=jobs/);
        await expect(tool.run({ action: "list_dir" })).rejects.toThrow(/use the list_dir tool/);
    });
});
