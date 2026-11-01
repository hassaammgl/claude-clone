import { spawn } from "node:child_process";
import { noopStatus, progressLogger, transformers, voiceDisabled, type StatusFn } from "./Transformers";

export interface TranscribeOptions {
    /** Whisper language code: en, hi, ur, ... (default: auto). */
    language?: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
    en: "english",
    hi: "hindi",
    ur: "urdu",
    ar: "arabic",
    fr: "french",
    de: "german",
    es: "spanish",
    zh: "chinese",
    ja: "japanese",
};

const SAMPLE_RATE = 16_000;
const MAX_SECONDS = 600;
const MAX_BYTES = 256 * 1024 * 1024;

/** Whisper ke common hallucination / noise outputs. Continuous listening me junk skip karne ke liye. */
const HALLUCINATIONS = [
    /^(thank you|thanks|thanks for watching|please subscribe|subscribe|you|bye|goodbye)[.!]?$/i,
    /subtitles? by .*/i,
    /amara\.org/i,
    /\[?(music|applause|laughter|silence)\]?/i,
    /please .*subscribe/i,
];

/** Kya transcript shayad sirf noise/hallucination hai? */
export function looksLikeNoise(text: string): boolean {
    const clean = text.trim().replace(/\s+/g, " ");
    if (clean.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return true;
    if (HALLUCINATIONS.some((pattern) => pattern.test(clean))) return true;

    // Same line baar baar repeat ho to noise maano
    const lines = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (lines.length >= 2) {
        const unique = new Set(lines.map((line) => line.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));
        if (unique.size <= Math.ceil(lines.length / 3)) return true;
    }

    return false;
}

/** Kisi bhi audio/video file ya URL ko 16kHz mono Float32 me decode karo (ffmpeg). */
export function decodeAudio(input: string): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            "ffmpeg",
            ["-v", "error", "-i", input, "-f", "f32le", "-ac", "1", "-ar", String(SAMPLE_RATE), "pipe:1"],
            { stdio: ["ignore", "pipe", "pipe"] },
        );

        const chunks: Buffer[] = [];
        let bytes = 0;
        let stderr = "";
        let settled = false;

        const fail = (message: string) => {
            if (settled) return;
            settled = true;
            child.kill("SIGKILL");
            reject(new Error(message));
        };

        child.stdout?.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > MAX_BYTES) {
                fail("audio bahut lamba hai (decoded data limit cross)");
                return;
            }
            chunks.push(chunk);
        });

        child.stderr?.on("data", (chunk: Buffer) => {
            if (stderr.length < 4_000) stderr += chunk.toString();
        });

        child.on("error", (e: any) => {
            if (e?.code === "ENOENT") fail("ffmpeg nahi mila — install karo: sudo pacman -S ffmpeg");
            else fail(`ffmpeg start nahi hua: ${e?.message ?? e}`);
        });

        child.on("close", (code) => {
            if (settled) return;
            if (code !== 0) {
                fail(`audio decode fail: ${stderr.trim().split("\n").slice(-2).join(" ") || `ffmpeg exit ${code}`}`);
                return;
            }
            if (!bytes) {
                fail("audio khali hai");
                return;
            }
            const buffer = Buffer.concat(chunks);
            const samples = new Float32Array(buffer.byteLength >> 2);
            for (let i = 0; i < samples.length; i++) samples[i] = buffer.readFloatLE(i * 4);
            settled = true;
            resolve(samples);
        });
    });
}

/** Local Whisper se speech-to-text. File, URL ya decoded Float32Array — sab chalega. */
export class SpeechToText {
    private pipe: Promise<any> | undefined;

    constructor(private status: StatusFn = noopStatus) {}

    async transcribe(input: string | Float32Array, options: TranscribeOptions = {}): Promise<string> {
        if (voiceDisabled()) throw new Error("voice band hai (NONI_VOICE=off)");

        const audio = typeof input === "string" ? await decodeAudio(input) : input;
        if (!audio.length) throw new Error("audio khali hai");

        const seconds = audio.length / SAMPLE_RATE;
        if (seconds > MAX_SECONDS) throw new Error(`audio ${Math.round(seconds)}s lamba hai (max ${MAX_SECONDS}s)`);

        const pipe = await this.pipeline();

        const config: Record<string, unknown> = {};
        // transformers.js whisper language auto-detect nahi karta; bina diye English maan leta hai.
        const language = options.language ?? process.env.NONI_STT_LANG?.trim() ?? "";
        if (language) config.language = LANGUAGE_NAMES[language] ?? language;
        if (seconds > 30) {
            config.chunk_length_s = 30;
            config.stride_length_s = 5;
        }

        this.status(`${seconds.toFixed(1)}s audio transcribe ho raha hai`, { event: "stt_start", seconds });
        const output = await pipe(audio, config);
        const text = String(output?.text ?? "").trim();

        this.status(`transcribe done (${text.length} chars)`, { event: "stt_done", chars: text.length });
        return text;
    }

    private async pipeline() {
        if (!this.pipe) {
            this.pipe = (async () => {
                const model = process.env.NONI_WHISPER_MODEL?.trim() || "Xenova/whisper-tiny";
                this.status(`STT model load: ${model}`, { event: "load", model });
                const { pipeline } = await transformers();
                const created = await (pipeline as any)("automatic-speech-recognition", model, {
                    dtype: "q8",
                    progress_callback: progressLogger(model, this.status),
                });
                this.status("STT ready: whisper", { event: "ready", model });
                return created;
            })();
            this.pipe.catch(() => {
                this.pipe = undefined;
            });
        }
        return this.pipe;
    }
}
