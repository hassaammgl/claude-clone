import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Player } from "./Player";
import { noopStatus, progressLogger, transformers, voiceDisabled, type StatusFn } from "./Transformers";

export type VoiceLanguage = "en" | "hi";

export interface SpeakOptions {
    /** Force a voice; default: text se detect. */
    language?: VoiceLanguage;
    /** Pehle wali speech rok do (auto-speak ke liye). */
    interrupt?: boolean;
}

const MAX_CHARS = (() => {
    const n = Number(process.env.NONI_TTS_MAX_CHARS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1_500;
})();
const CHUNK_CHARS = 260;

/** Markdown/code/URLs hatao — bolne ke liye sirf plain text rakho. */
export function speakableText(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, " code block skipped. ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/https?:\/\/\S+/g, " link ")
        .replace(/^[ \t]*[#>*+\-]+[ \t]*/gm, "")
        .replace(/[*_~]{1,3}/g, "")
        .replace(/\|/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, ". ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CHARS);
}

/** Text ko chhote sentences me todo, taake TTS model har chunk aaram se bole. */
export function splitForSpeech(text: string, max = CHUNK_CHARS): string[] {
    const sentences = text.split(/(?<=[.!?।॥])\s+/);
    const chunks: string[] = [];
    let current = "";

    for (const sentence of sentences) {
        if (!sentence.trim()) continue;

        if (!current) {
            if (sentence.length <= max) {
                current = sentence;
            } else {
                for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max));
            }
            continue;
        }

        if (`${current} ${sentence}`.length <= max) {
            current = `${current} ${sentence}`;
        } else {
            chunks.push(current);
            if (sentence.length <= max) {
                current = sentence;
            } else {
                for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max));
                current = "";
            }
        }
    }

    if (current) chunks.push(current);
    return chunks.filter((chunk) => chunk.trim().length > 0);
}

/** Urdu/Arabic script ka ONNX TTS model available nahi hai, isliye skip. */
export function detectVoiceLanguage(text: string): VoiceLanguage | "unsupported" {
    if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return "unsupported";
    if (/[\u0900-\u097F]/.test(text)) return "hi";
    return "en";
}

/**
 * Local multilingual TTS (English + Hindi) Transformers.js ke saath.
 * Models pehli use pe download hote hain, phir cache se load.
 */
export class TextToSpeech {
    private pipes = new Map<string, Promise<any>>();
    private queue: Promise<void> = Promise.resolve();
    private player = new Player();
    private token = 0;

    constructor(private status: StatusFn = noopStatus) {}

    /** Bol ke sunao. Queue me chalta hai; interrupt se purani speech ruk jati hai. */
    async speak(text: string, options: SpeakOptions = {}): Promise<string> {
        if (voiceDisabled()) throw new Error("voice band hai (NONI_VOICE=off)");

        const clean = speakableText(text);
        if (!clean) return "bolne ke liye kuch nahi mila";

        const chunks = splitForSpeech(clean);
        if (!chunks.length) return "bolne ke liye kuch nahi mila";

        if (options.interrupt) this.stop();

        const token = this.token;
        let spokenChars = 0;
        let skipped = 0;

        const work = async () => {
            const dir = await mkdtemp(join(tmpdir(), "noni-voice-"));

            try {
                let index = 0;
                for (const chunk of chunks) {
                    if (token !== this.token) return;

                    const language = options.language ?? detectVoiceLanguage(chunk);
                    if (language === "unsupported") {
                        skipped++;
                        this.status("urdu TTS available nahi hai, chunk skip kiya", { event: "skip" });
                        continue;
                    }

                    const pipe = await this.pipeline(language);
                    if (token !== this.token) return;

                    const audio = await pipe(chunk);
                    if (token !== this.token) return;

                    const file = join(dir, `chunk-${index++}.wav`);
                    await audio.save(file);
                    if (token !== this.token) return;

                    await this.player.play(file);
                    spokenChars += chunk.length;
                }
            } finally {
                await rm(dir, { recursive: true, force: true }).catch(() => {});
            }

            if (spokenChars > 0) {
                this.status(`bola ${spokenChars} chars`, { event: "speak_done", chars: spokenChars });
            }
        };

        this.queue = this.queue.then(work, work);
        await this.queue;

        if (spokenChars === 0 && skipped > 0) return "ye text Urdu/Arabic me hai — Urdu TTS abhi support nahi";
        return spokenChars > 0 ? `bola ${spokenChars} chars` : "speech ruk gayi";
    }

    /** Current playback + queue stop. */
    stop() {
        this.token++;
        this.player.stop();
        this.queue = Promise.resolve();
    }

    private async pipeline(language: VoiceLanguage) {
        const model =
            language === "hi"
                ? (process.env.NONI_TTS_MODEL_HIN?.trim() || "Xenova/mms-tts-hin")
                : (process.env.NONI_TTS_MODEL_ENG?.trim() || "Xenova/mms-tts-eng");

        let pipe = this.pipes.get(model);
        if (!pipe) {
            pipe = (async () => {
                this.status(`TTS model load: ${model}`, { event: "load", model, language });
                const { pipeline } = await transformers();
                // transformers.js pipeline typing bahut strict hai; runtime shape simple hai
                const created = await (pipeline as any)("text-to-speech", model, {
                    dtype: "q8",
                    progress_callback: progressLogger(model, this.status),
                });
                this.status(`TTS ready: ${language}`, { event: "ready", model, language });
                return created;
            })();
            pipe.catch(() => this.pipes.delete(model));
            this.pipes.set(model, pipe);
        }
        return pipe;
    }
}
