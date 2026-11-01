import { Tool } from "./Tool";
import type { SpeechToText } from "../audio/SpeechToText";
import type { TextToSpeech, VoiceLanguage } from "../audio/TextToSpeech";

/** Agent ko explicit voice output dene ke liye. Normal replies auto-speak hote hain. */
export class SpeakTool extends Tool {
    readonly name = "speak";
    readonly description =
        "Speak text out loud with a local TTS voice (English or Hindi). " +
        "Use only when the user explicitly asks for audio/voice output; normal replies may already be spoken automatically. " +
        "Code blocks are skipped. Urdu/Arabic TTS is not available.";
    readonly parameters = {
        type: "object",
        properties: {
            text: { type: "string", description: "Text to say out loud." },
            language: { type: "string", enum: ["en", "hi"], description: "Voice language. Auto-detect if omitted." },
        },
        required: ["text"],
    };

    constructor(private tts: TextToSpeech) {
        super();
    }

    async run(args: Record<string, any>): Promise<string> {
        const text = String(args.text ?? "").trim();
        if (!text) throw new Error("text is empty");

        const language: VoiceLanguage | undefined =
            args.language === "hi" ? "hi" : args.language === "en" ? "en" : undefined;

        return this.tts.speak(text, { language });
    }
}

/** Audio file/URL ko local Whisper se text me badalta hai. */
export class TranscribeTool extends Tool {
    readonly name = "transcribe";
    readonly description =
        "Transcribe an audio or video file (local path or URL) to text using a local Whisper model. " +
        "Use this for speech-to-text; recording from the microphone is done by the user with /listen. " +
        "Requires ffmpeg.";
    readonly parameters = {
        type: "object",
        properties: {
            path: { type: "string", description: "Audio/video file path or URL to transcribe." },
            language: {
                type: "string",
                enum: ["en", "hi", "ur"],
                description: "Spoken language. Omit for auto-detect.",
            },
        },
        required: ["path"],
    };

    constructor(private stt: SpeechToText) {
        super();
    }

    async run(args: Record<string, any>): Promise<string> {
        const path = String(args.path ?? "").trim();
        if (!path) throw new Error("path is empty");

        const language = typeof args.language === "string" ? args.language : undefined;
        const text = await this.stt.transcribe(path, { language });
        return text || "(koi speech detect nahi hui)";
    }
}
