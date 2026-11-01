import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Voice/TTS/STT status ke liye TUI logger callback. */
export type StatusFn = (message: string, data?: Record<string, unknown>) => void;

export const noopStatus: StatusFn = () => {};

/** Models yahan cache hote hain; pehli baar download honge. */
export const MODEL_DIR = process.env.NONI_MODEL_DIR ?? join(homedir(), ".cache", "noni", "models");

type TransformersLib = typeof import("@huggingface/transformers");

let lib: TransformersLib | null = null;
let pending: Promise<TransformersLib> | null = null;

/**
 * Transformers.js lazily load karo — app startup fast rehta hai aur bina audio
 * use kiye koi heavy ONNX import nahi hota.
 */
export async function transformers(): Promise<TransformersLib> {
    if (lib) return lib;
    if (!pending) {
        pending = (async () => {
            const mod = await import("@huggingface/transformers");
            try {
                mkdirSync(MODEL_DIR, { recursive: true });
            } catch {
                // read-only home: transformers apna default cache use karega
            }
            mod.env.cacheDir = MODEL_DIR;
            mod.env.allowRemoteModels = true;
            lib = mod;
            return mod;
        })();
    }
    return pending;
}

function envOff(name: string): boolean {
    const value = (process.env[name] ?? "").trim().toLowerCase();
    return value === "off" || value === "0" || value === "false" || value === "no";
}

function envOn(name: string): boolean {
    const value = (process.env[name] ?? "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
}

/** NONI_VOICE=off se saara audio band. */
export function voiceDisabled(): boolean {
    return envOff("NONI_VOICE");
}

/** NONI_MUTE=1 se sirf playback band (synthesis test ke liye useful). */
export function voiceMuted(): boolean {
    return envOn("NONI_MUTE");
}

/** Download progress ko 25% steps me report karo, taake TUI spam na ho. */
export function progressLogger(model: string, status: StatusFn) {
    let next = 25;
    let currentFile = "";

    return (event: any) => {
        if (!event || event.status !== "progress") return;
        // Sirf asli model files; chhote config/tokenizer files skip
        if (typeof event.file !== "string" || !event.file.endsWith(".onnx")) return;
        if (event.file !== currentFile) {
            currentFile = event.file;
            next = 25;
        }
        if (typeof event.progress !== "number" || event.progress < next) return;

        const percent = Math.round(event.progress);
        if (percent >= 100) return; // "model ready" line alag se aati hai
        status(`${model}: download ${percent}%`, { event: "download", model });
        next += 25;
    };
}

export function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
