import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { noopStatus, type StatusFn } from "./Transformers";

function ffmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";

        child.stderr?.on("data", (chunk) => {
            if (stderr.length < 4_000) stderr += chunk.toString();
        });
        child.on("error", (e: any) => {
            if (e?.code === "ENOENT") reject(new Error("ffmpeg nahi mila — install karo: sudo pacman -S ffmpeg"));
            else reject(new Error(e?.message ?? String(e)));
        });
        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr.trim().split("\n").slice(-2).join(" ") || `ffmpeg exit ${code}`));
        });
    });
}

/**
 * Mic se fixed duration record karo aur WAV path wapas do.
 * Pulse pehle, phir ALSA fallback. Caller file delete kare.
 */
export async function recordAudio(seconds: number, status: StatusFn = noopStatus): Promise<string> {
    const duration = Math.max(1, Math.min(Math.round(seconds), 60));
    const file = join(tmpdir(), `noni-rec-${randomUUID()}.wav`);

    status(`${duration}s record ho raha hai — bolna shuru karo`, { event: "record_start", seconds: duration });

    const output = ["-y", "-t", String(duration), "-ac", "1", "-ar", "16000", "-vn", file];
    const attempts: string[][] = [
        ["-v", "error", "-f", "pulse", "-i", "default", ...output],
        ["-v", "error", "-f", "alsa", "-i", "default", ...output],
    ];

    let last = "";
    for (const args of attempts) {
        try {
            await ffmpeg(args);
            status(`${duration}s record ho gaya`, { event: "record_done", seconds: duration });
            return file;
        } catch (e) {
            last = e instanceof Error ? e.message : String(e);
            if (/ffmpeg nahi mila/.test(last)) throw new Error(last);
        }
    }

    throw new Error(`mic record nahi hua: ${last || "koi input device nahi mila"}`);
}
