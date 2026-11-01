import { spawn } from "node:child_process";
import { voiceMuted } from "./Transformers";

interface PlayerCommand {
    cmd: string;
    args: (file: string) => string[];
}

/** Linux pe common players; jo mile woh try hote hain. */
const PLAYERS: PlayerCommand[] = [
    { cmd: "paplay", args: (file) => [file] },
    { cmd: "pw-play", args: (file) => [file] },
    { cmd: "aplay", args: (file) => ["-q", file] },
    { cmd: "ffplay", args: (file) => ["-nodisp", "-autoexit", "-loglevel", "quiet", file] },
    { cmd: "mpv", args: (file) => ["--no-video", "--really-quiet", "--no-terminal", file] },
];

/** WAV file ko speakers pe bajata hai, aur stop() se beech me rok sakte hain. */
export class Player {
    private child: ReturnType<typeof spawn> | null = null;
    private stopped = false;

    async play(file: string): Promise<string> {
        if (voiceMuted()) return "muted";

        this.stopped = false;
        const failures: string[] = [];

        for (const player of PLAYERS) {
            try {
                await this.run(player.cmd, player.args(file));
                return player.cmd;
            } catch (e) {
                if (this.stopped) throw new Error("playback stopped");
                const msg = e instanceof Error ? e.message : String(e);
                // ENOENT = player installed nahi hai, agla try karo
                if (!/ENOENT/.test(msg)) failures.push(`${player.cmd}: ${msg}`);
            }
        }

        throw new Error(
            failures.length
                ? `koi audio player kaam nahi kiya (${failures.join("; ")})`
                : "koi audio player nahi mila (ffmpeg ya pulseaudio-utils install karo)",
        );
    }

    stop() {
        this.stopped = true;
        this.child?.kill("SIGTERM");
        this.child = null;
    }

    private run(cmd: string, args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
            this.child = child;

            let stderr = "";
            child.stderr?.on("data", (chunk) => {
                if (stderr.length < 2_000) stderr += chunk.toString();
            });

            child.on("error", (e) => {
                if (this.child === child) this.child = null;
                reject(e);
            });
            child.on("close", (code, signal) => {
                if (this.child === child) this.child = null;
                if (code === 0) resolve();
                else reject(new Error(stderr.trim() || `exit ${code ?? signal ?? "?"}`));
            });
        });
    }
}
