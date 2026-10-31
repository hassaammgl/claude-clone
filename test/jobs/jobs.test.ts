import { afterEach, describe, expect, test } from "bun:test";
import { JobManager } from "../../src/jobs/JobManager";

const managers: JobManager[] = [];

function make() {
    const jobs = new JobManager();
    managers.push(jobs);
    return jobs;
}

afterEach(async () => {
    await Promise.all(managers.splice(0).map((jobs) => jobs.closeAll()));
});

describe("JobManager", () => {
    test("runs a command, captures output and marks it done", async () => {
        const jobs = make();
        const job = jobs.start("echo hello", process.cwd());
        const { job: done, timedOut } = await jobs.wait(job.id, 5_000);

        expect(timedOut).toBe(false);
        expect(done.status).toBe("done");
        expect(done.exitCode).toBe(0);
        expect(jobs.output(done)).toBe("hello");
    });

    test("marks a non-zero exit as failed and keeps stderr", async () => {
        const jobs = make();
        const job = jobs.start("echo oops >&2; exit 3", process.cwd());
        const { job: done } = await jobs.wait(job.id, 5_000);

        expect(done.status).toBe("failed");
        expect(done.exitCode).toBe(3);
        expect(jobs.output(done)).toContain("[stderr]");
        expect(jobs.output(done)).toContain("oops");
    });

    test("wait times out without killing the job", async () => {
        const jobs = make();
        const job = jobs.start("sleep 1.5; echo late", process.cwd());

        const first = await jobs.wait(job.id, 100);
        expect(first.timedOut).toBe(true);
        expect(first.job.status).toBe("running");

        const second = await jobs.wait(job.id, 5_000);
        expect(second.timedOut).toBe(false);
        expect(second.job.status).toBe("done");
        expect(jobs.output(second.job)).toContain("late");
    });

    test("kill stops a running job", async () => {
        const jobs = make();
        const job = jobs.start("sleep 10", process.cwd());
        expect(jobs.kill(job.id).status).toBe("killed");

        const { job: done } = await jobs.wait(job.id, 5_000);
        expect(done.status).toBe("killed");
    });

    test("reports start/finish events and renders jobs", async () => {
        const events: string[] = [];
        const jobs = new JobManager((event, job) => events.push(`${event}:${job.id}`));
        managers.push(jobs);

        const job = jobs.start("echo ok", process.cwd());
        await jobs.wait(job.id, 5_000);

        expect(events).toEqual([`start:${job.id}`, `finish:${job.id}`]);
        expect(jobs.render()).toContain(`job ${job.id} done`);
        expect(jobs.render()).toContain("echo ok");
    });
});
