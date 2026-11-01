import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { noopStatus, type StatusFn } from "./Transformers";

type Attempt = "speech" | "silent" | "failed" | "cancelled";

let active: { child: ChildProcess; file: string; discard: boolean; stop?: () => void } | null = null;

function tempFile(): string {
    return join(tmpdir(), `noni-rec-${randomUUID()}.wav`);
}

function ffmpegError(stderr: string, code: number | null): string {
    return stderr.trim().split("\n").slice(-2).join(" ") || `ffmpeg exit ${code ?? "?"}`;
}

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
            else reject(new Error(ffmpegError(stderr, code)));
        });
    });
}

/**
 * Mic se fixed duration record karo aur WAV path wapas do.
 * Pulse pehle, phir ALSA fallback. Caller file delete kare.
 */
export async function recordAudio(seconds: number, status: StatusFn = noopStatus): Promise<string> {
    const duration = Math.max(1, Math.min(Math.round(seconds), 60));
    const file = tempFile();

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

/** Chal rahi recording rok do. discard = true hone pe adhoori clip delete ho jati hai. */
export function stopRecording(discard = true) {
    if (!active) return;
    active.discard = discard;
    if (active.stop) active.stop();
    else active.child.kill("SIGINT");
}

export interface UtteranceOptions {
    /** Ek utterance ki max length (default 6s). */
    maxSeconds?: number;
    /** Silence threshold, ffmpeg format (default -35dB). */
    noise?: string;
    /** Itni der silence aaye to utterance khatam (default 1.1s). */
    silenceSeconds?: number;
    /** Itni der tak koi silence na mile to record rok do (default 5s). */
    noSpeechSeconds?: number;
}

function envNumber(name: string, fallback: number): number {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Ek utterance record karo: bolna shuru hone ka wait, phir silence pe khud ruk jao.
 * Koi awaaz nahi aayi to null (file delete ho jati hai).
 */
export async function recordUtterance(
    status: StatusFn = noopStatus,
    options: UtteranceOptions = {},
): Promise<string | null> {
    const cfg = {
        maxSeconds: Math.min(Math.max(Math.round(options.maxSeconds ?? envNumber("NONI_LISTEN_MAX_SEC", 6)), 3), 120),
        noise: options.noise ?? process.env.NONI_MIC_NOISE?.trim() ?? "-35dB",
        silenceSeconds: options.silenceSeconds ?? 1.1,
        noSpeechSeconds: options.noSpeechSeconds ?? envNumber("NONI_LISTEN_WAIT_SEC", 5),
    };

    const sources: string[][] = [
        ["-f", "pulse", "-i", "default"],
        ["-f", "alsa", "-i", "default"],
    ];

    let last = "";
    for (const source of sources) {
        const file = tempFile();
        const result = await recordAttempt(source, file, cfg);

        if (result === "speech") {
            status("awaaz mili, transcribe kar rahi hoon", { event: "listen_got" });
            return file;
        }

        await unlink(file).catch(() => {});

        if (result === "silent" || result === "cancelled") {
            if (result === "cancelled") status("listening ruk gayi", { event: "listen_stop" });
            return null;
        }

        last = "mic input nahi khula";
    }

    throw new Error(`mic record nahi hua: ${last || "koi input device nahi mila"}`);
}

function recordAttempt(
    source: string[],
    file: string,
    cfg: { maxSeconds: number; noise: string; silenceSeconds: number; noSpeechSeconds: number },
): Promise<Attempt> {
    return new Promise((resolve) => {
        const args = [
            "-hide_banner",
            "-nostats",
            "-v",
            "info",
            ...source,
            "-ac",
            "1",
            "-ar",
            "16000",
            "-vn",
            "-af",
            `silencedetect=noise=${cfg.noise}:d=${cfg.silenceSeconds}`,
            "-t",
            String(cfg.maxSeconds),
            "-y",
            file,
        ];

        const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        const state: { child: ChildProcess; file: string; discard: boolean; stop?: () => void } = { child, file, discard: false };
        active = state;

        let buffer = "";
        let heard = false;
        let sawSilence = false;
        let speechStart = 0;
        let speechEnd = 0;
        let settled = false;
        let notFound = false;
        let killTimer: NodeJS.Timeout | undefined;

        const finish = (result: Attempt) => {
            if (settled) return;
            settled = true;
            clearTimeout(waitTimer);
            if (killTimer) clearTimeout(killTimer);
            if (active === state) active = null;
            if (state.discard) resolve("cancelled");
            else resolve(result);
        };

        const stop = () => {
            if (settled) return;
            child.kill("SIGINT");
            // ffmpeg wav header finalize kare, warna SIGKILL
            killTimer = setTimeout(() => child.kill("SIGKILL"), 1_500);
            killTimer.unref?.();
        };
        state.stop = stop;

        // Koi bol hi nahi raha to itni der baad chhod do
        const waitTimer = setTimeout(() => {
            if (!heard) stop();
        }, cfg.noSpeechSeconds * 1_000);
        waitTimer.unref?.();

        child.stderr?.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            let index: number;
            while ((index = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, index);
                buffer = buffer.slice(index + 1);

                const match = line.match(/(silence_start|silence_end):\s*([\d.]+)/);
                if (!match) continue;

                const at = Number(match[2]);
                if (match[1] === "silence_end") {
                    // silence khatam = bolna shuru
                    if (!heard) {
                        heard = true;
                        speechStart = at;
                        clearTimeout(waitTimer);
                    }
                } else {
                    sawSilence = true;
                    if (heard) {
                        speechEnd = at;
                        // bolna band — tail ke liye thoda intezaar
                        if (!killTimer) {
                            killTimer = setTimeout(stop, 350);
                            killTimer.unref?.();
                        }
                    }
                }
            }
        });

        child.on("error", (e: any) => {
            if (e?.code === "ENOENT") notFound = true;
            finish("failed");
        });

        child.on("close", (code) => {
            if (notFound) {
                finish("failed");
                return;
            }

            const ok = existsSync(file) && statSync(file).size > 1_000;
            if (!ok) {
                finish("failed");
                return;
            }

            // Quiet mic: shuru se silence tha aur bolna shuru hi nahi hua -> discard.
            // Noisy mic: silence_start hi nahi aaya, audio ko speech maano.
            // Bahut chhota blip (keyboard click) bhi discard.
            const tooShort = heard && speechEnd > speechStart && speechEnd - speechStart < 0.45;
            finish(tooShort ? "silent" : heard || !sawSilence ? "speech" : "silent");
        });
    });
}
