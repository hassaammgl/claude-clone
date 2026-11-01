import { join } from "node:path";
import { rm } from "node:fs/promises";
import { Ollama } from "ollama";
import { Agent } from "./src/agent/Agent";
import { McpManager } from "./src/mcp/McpManager";
import { BashTool } from "./src/tools/BashTool";
import { GlobTool, GrepTool } from "./src/tools/SearchTools";
import { SystemInfoTool } from "./src/tools/SystemTool";
import {
  DeleteFileTool,
  EditFileTool,
  ListDirTool,
  ReadFileTool,
  WriteFileTool,
} from "./src/tools/FileTool";
import { Tui } from "./src/ui/Tui";
import { SessionLogger, type LogType } from "./src/log/SessionLogger";
import { JobManager } from "./src/jobs/JobManager";
import { WebFetchTool, WebSearchTool } from "./src/tools/WebTools";
import { SearchEngine } from "./src/search/SearchEngine";
import { SearxngProvider } from "./src/search/SearxngProvider";
import { DuckDuckGoProvider } from "./src/search/DuckDuckGoProvider";
import { DocsGuard, DocsRegistry } from "./src/docs/DocsGuard";
import { NodeModulesSource, SystemSource } from "./src/docs/LocalSources";
import { RegistrySource, WebDocsSource } from "./src/docs/RemoteSources";
import { ReadDocsTool } from "./src/tools/DocsTool";
import { TodoStore } from "./src/todos/TodoStore";
import { TodoTool } from "./src/tools/TodoTool";
import { TextToSpeech } from "./src/audio/TextToSpeech";
import { SpeechToText, looksLikeNoise } from "./src/audio/SpeechToText";
import { recordAudio, recordUtterance, stopRecording } from "./src/audio/Recorder";
import { voiceDisabled } from "./src/audio/Transformers";
import { SpeakTool, TranscribeTool } from "./src/tools/AudioTools";

const cwd = process.cwd();
const ui = new Tui();

// TUI live feed me sirf system-level events; tool calls/results already apne format me dikhte hain
const LIVE_LOG_TYPES = new Set<LogType>([
  "agent_start",
  "agent_end",
  "model",
  "model_request",
  "model_response",
  "model_retry",
  "guard_block",
  "mcp",
  "job",
  "voice",
]);

const logger = new SessionLogger(cwd, {
  onEvent: (line, event) => {
    if (LIVE_LOG_TYPES.has(event.type)) ui.event(line);
  },
});
const jobs = new JobManager((event, job) =>
  logger.log("job", {
    event,
    id: job.id,
    status: job.status,
    command: job.command,
    exit_code: job.exitCode,
    duration_ms: (job.endedAt ?? Date.now()) - job.startedAt,
  }),
);

const voiceStatus = (message: string, data?: Record<string, unknown>) =>
  logger.event("voice", { event: "status", message, ...(data ?? {}) });
const tts = new TextToSpeech(voiceStatus);
const stt = new SpeechToText(voiceStatus);
let autoSpeak = !voiceDisabled() && !["0", "off", "false", "no"].includes((process.env.NONI_AUTO_SPEAK ?? "").trim().toLowerCase());
let listening = false;

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
});
const mcp = new McpManager();

const FALLBACK_MODEL = "qwen3.5:0.8b";

/** "752.39M" / "1.9B" -> billions, taake sabse chhota model pehle aaye. */
function paramsB(text: string): number {
  const m = /([\d.]+)\s*([KMBT])/i.exec(text);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = Number(m[1]);
  const unit = m[2]!.toUpperCase();
  return n * (unit === "K" ? 1e-6 : unit === "M" ? 1e-3 : unit === "B" ? 1 : 1e3);
}

/** Startup pe model chuno. OLLAMA_MODEL set ho ya stdin TTY na ho to bina puche wahi/fallback. */
async function pickModel(): Promise<string> {
  const fromEnv = process.env.OLLAMA_MODEL?.trim();
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) return FALLBACK_MODEL;

  try {
    const { models } = await ollama.list();
    const choices = models
      .filter((m) => {
        const caps = (m as { capabilities?: string[] }).capabilities;
        return !caps?.length || caps.includes("completion");
      })
      .map((m) => {
        const params = m.details?.parameter_size ?? "?";
        return {
          name: m.name,
          params,
          size: m.size ? `${(m.size / 1024 ** 3).toFixed(1)} GB` : "?",
          order: paramsB(params === "?" ? m.name : params),
          bytes: m.size,
        };
      })
      .sort((a, b) => a.order - b.order || a.bytes - b.bytes);

    if (!choices.length) {
      ui.warn(`koi chat model nahi mila, ${FALLBACK_MODEL} use kar rahi hoon`);
      return FALLBACK_MODEL;
    }
    return await ui.chooseModel(choices, 0); // sabse chhota = default
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.warn(`Ollama se model list nahi aayi (${msg}); ${FALLBACK_MODEL} use kar rahi hoon`);
    return FALLBACK_MODEL;
  }
}

const agent = new Agent(ollama, await pickModel(), ui, cwd);
agent.addLogger(logger);

const search = new SearchEngine([
  new SearxngProvider(process.env.SEARXNG_URL ?? "http://localhost:8080"), // pehle apna
  new DuckDuckGoProvider(), // fallback
]);
const docs = new DocsRegistry();
const todos = new TodoStore();

// third-party import wale edit pe docs padhna zaroori
agent.addGuard(new DocsGuard(docs, cwd));
// Plan har run ke system prompt me, taake model apne tasks na bhoole
agent.addContext(() => (todos.size ? todos.render(6_000) : ""));

const mcpTools = await mcp.load(join(cwd, "mcp.json"));
agent.addTools(
  new ReadFileTool(cwd),
  new ListDirTool(cwd),
  new WriteFileTool(cwd),
  new EditFileTool(cwd),
  new DeleteFileTool(cwd),
  new BashTool(cwd, jobs),
  new GlobTool(cwd),
  new GrepTool(cwd),
  new SystemInfoTool(),
  new TodoTool(todos),
  new WebSearchTool(search),
  new WebFetchTool(),
  new ReadDocsTool(docs, [
    new NodeModulesSource(cwd), // JS/TS: installed package
    new SystemSource(cwd), // Python (pydoc), Go (go doc), C/C++ (man + /usr/include)
    new RegistrySource(), // npm / PyPI
    new WebDocsSource(search), // last resort
  ]),
  new SpeakTool(tts),
  new TranscribeTool(stt),
  ...mcpTools,
);

let busy = false;
let closing = false;
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  listening = false;
  stopRecording();
  tts.stop();
  logger.sessionEnd();
  await jobs.closeAll();
  await logger.close();
  await mcp.close();
}

ui.onExit(async () => {
  closing = true;
  // Stream ke beech Ctrl-D se process na mare, pehle current run poora hone do
  if (busy) return;
  await shutdown();
  process.exit(0);
});

ui.banner(agent.model, agent.listTools().length, todos.size);
logger.sessionStart(agent.model, agent.listTools().length);
if (mcpTools.length) logger.event("mcp", { tools: mcpTools.length, config: join(cwd, "mcp.json") });

/** Ek user message agent ko bhejo + auto-speak. Normal prompt aur /listen dono yahi use karte hain. */
async function runAgent(text: string) {
  // Typed prompt aaya to adhoori recording chhod do, warna double input ja sakta hai
  if (listening) stopRecording();

  // Ek waqt me ek hi agent run (continuous listening + typed prompt race se bachne ke liye)
  while (busy) await sleep(100);

  busy = true;
  try {
    const reply = await agent.run(text);
    if (autoSpeak && reply.trim()) {
      void tts.speak(reply, { interrupt: true }).catch((e: unknown) => {
        logger.event("voice", { event: "error", message: e instanceof Error ? e.message : String(e) });
      });
    }
  } catch (e: any) {
    logger.error(e.message);
    ui.error(e.message);
  } finally {
    busy = false;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Jab tak listening ON hai: bolo → silence pe khud ruk kar transcribe → agent ko bhejo. */
async function listenLoop() {
  while (listening) {
    if (busy) {
      await sleep(200);
      continue;
    }

    // Apni hi speech wapas mic me na aaye
    await tts.whenIdle();
    if (!listening) break;
    if (busy) continue;
    await sleep(250);

    let file: string | null = null;
    try {
      file = await recordUtterance(voiceStatus);
    } catch (e: any) {
      if (!listening) break;
      logger.error(e.message);
      ui.error(`listen: ${e.message}`);
      await sleep(1_500);
      continue;
    }

    if (!file) continue;

    try {
      if (!listening) break;
      const text = await stt.transcribe(file);
      if (text && listening) {
        if (looksLikeNoise(text)) {
          logger.event("voice", { event: "listen_skip", message: "noise/hallucination skip", chars: text.length });
          continue;
        }
        ui.log(`🎤 ${text}`);
        logger.input(text);
        await runAgent(text);
      }
    } catch (e: any) {
      if (!listening) break;
      logger.error(e.message);
      ui.error(`listen: ${e.message}`);
      await sleep(500);
    } finally {
      await rm(file, { force: true }).catch(() => {});
    }
  }
}

function startListening() {
  if (listening) return;
  if (voiceDisabled()) {
    ui.warn("voice band hai (NONI_VOICE=off)");
    return;
  }
  listening = true;
  ui.log("listening: ON — bolo, rukne pe khud transcribe hoga. Band karne ke liye /listen off");
  void listenLoop().catch((e: any) => {
    listening = false;
    logger.error(e.message);
    ui.error(`listen: ${e.message}`);
  });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  stopRecording();
  ui.log("listening: OFF");
}

while (true) {
  let input: string;
  try {
    input = await ui.prompt();
  } catch {
    break;
  }
  if (!input) continue;
  logger.input(input);
  if (input.startsWith("/")) logger.command(input);

  if (input === "/exit") ui.close();
  else if (input === "/clear") agent.reset();
  else if (input === "/think") {
    agent.think = !agent.think;
    ui.log(`thinking: ${agent.think ? "ON" : "OFF"}`);
  } else if (input === "/help")
    ui.log(
      [
        "/help            ye list",
        "/tools           tools + dangerous markers",
        "/todos           current plan",
        "/todos clear     plan hatao",
        "/jobs            background jobs",
        "/jobs kill <id>  job band karo",
        "/logs [n]        last n events (in-memory, TUI me)",
        "/logs live       live event feed ON/OFF toggle",
        "/logs on|off     live feed ko seedha on/off",
        "/logs file       file logging status",
        "/say <text>      TTS se bolo (en/hi)",
        "/say on|off      auto-speak toggle (stop se speech band)",
        "/listen          listening ON/OFF toggle (silence pe auto-send)",
        "/listen on|off   seedha on ya off",
        "/listen <sec>    ek baar fixed seconds record + transcribe",
        "/voice           speak + listening status",
        "/voice on|off    dono ek saath on/off",
        "/voice stop      chal rahi speech rok do",
        "/model <name>    model switch",
        "/clear           chat history clear (plan rehta hai)",
        "/think           thinking on/off",
        "/exit            quit",
      ].join("\n"),
    );
  else if (input === "/tools")
    agent
      .listTools()
      .forEach((t) => ui.log(`${t.dangerous ? "⚠" : "·"} ${t.name}`));
  else if (input === "/todos") ui.todoTree(todos.render());
  else if (input === "/todos clear") {
    todos.clear();
    ui.log("todos cleared");
  } else if (input === "/jobs") {
    ui.log(jobs.render());
  } else if (input.startsWith("/jobs kill ")) {
    const id = input.split(/\s+/)[2] ?? "";
    if (!id) {
      ui.warn("usage: /jobs kill <id>");
    } else {
      try {
        const job = jobs.kill(id);
        logger.log("job", { event: "kill", id: job.id, status: job.status, command: job.command });
        ui.log(`job ${job.id}: ${job.status}`);
      } catch (e: any) {
        logger.error(e.message);
        ui.error(e.message);
      }
    }
  } else if (input === "/logs" || input.startsWith("/logs ")) {
    const arg = input.split(/\s+/)[1] ?? "";

    if (arg === "live" || arg === "on" || arg === "off") {
      const next = arg === "live" ? !ui.liveLogs : arg === "on";
      ui.setLiveLogs(next);
      ui.log(`live logs: ${next ? "ON" : "OFF"}`);
    } else if (arg === "file") {
      ui.log(
        logger.writesFile
          ? `file logging: ON → ${logger.path}`
          : "file logging: OFF (sirf memory + TUI). Chahiye to NONI_LOG_FILE=1 se chalao.",
      );
    } else {
      const n = Number(arg) || 20;
      const lines = await logger.tail(n);
      ui.log(
        [
          `logs: ${logger.count} events in memory · live feed ${ui.liveLogs ? "ON" : "OFF"}`,
          lines.join("\n") || "(empty)",
        ].join("\n"),
      );
    }
  } else if (input === "/voice" || input.startsWith("/voice ")) {
    const arg = input.split(/\s+/)[1] ?? "";
    if (arg === "on") {
      autoSpeak = true;
      startListening();
      ui.log("voice: ON (speak + listen)");
    } else if (arg === "off") {
      autoSpeak = false;
      stopListening();
      tts.stop();
      ui.log("voice: OFF (speak + listen)");
    } else if (arg === "stop") {
      tts.stop();
      ui.log("speech stopped");
    } else {
      ui.log(
        [
          `speak: ${autoSpeak ? "ON" : "OFF"} · listening: ${listening ? "ON" : "OFF"}`,
          `tts en: ${process.env.NONI_TTS_MODEL_ENG ?? "Xenova/mms-tts-eng"}`,
          `tts hi: ${process.env.NONI_TTS_MODEL_HIN ?? "Xenova/mms-tts-hin"}`,
          `stt:    ${process.env.NONI_WHISPER_MODEL ?? "Xenova/whisper-tiny"} (lang: ${process.env.NONI_STT_LANG ?? "en default"})`,
          "/voice on|off|stop · /say on|off · /listen on|off",
        ].join("\n"),
      );
    }
  } else if (input === "/say" || input.startsWith("/say ")) {
    const arg = input.slice(4).trim();
    if (!arg) ui.warn("usage: /say <text> | /say on|off|stop");
    else if (arg === "on") {
      autoSpeak = true;
      ui.log("say: ON — har reply bolegi");
    } else if (arg === "off") {
      autoSpeak = false;
      tts.stop();
      ui.log("say: OFF");
    } else if (arg === "stop") {
      tts.stop();
      ui.log("speech stopped");
    } else {
      try {
        ui.log(await tts.speak(arg, { interrupt: true }));
      } catch (e: any) {
        logger.error(e.message);
        ui.error(`voice: ${e.message}`);
      }
    }
  } else if (input === "/listen" || input.startsWith("/listen ")) {
    const args = input.split(/\s+/).slice(1);
    const first = args[0] ?? "";

    if (!first || first === "on" || first === "off") {
      if (first === "on") startListening();
      else if (first === "off") stopListening();
      else if (listening) stopListening();
      else startListening();
    } else {
      // Backward-compatible one-shot: /listen 8 [en|hi|ur]
      const seconds = Number(first);
      const language = ["en", "hi", "ur"].includes(args[1] ?? "") ? args[1] : undefined;
      if (!Number.isFinite(seconds) || seconds <= 0) {
        ui.warn("usage: /listen | /listen on|off | /listen <sec> [en|hi|ur]");
      } else {
        try {
          const file = await recordAudio(seconds, voiceStatus);
          try {
            const text = await stt.transcribe(file, language ? { language } : {});
            if (!text || looksLikeNoise(text)) {
              ui.warn("kuch samajh nahi aaya — dobara try karo");
            } else {
              ui.log(`🎤 ${text}`);
              logger.input(text);
              await runAgent(text);
            }
          } finally {
            await rm(file, { force: true }).catch(() => {});
          }
        } catch (e: any) {
          logger.error(e.message);
          ui.error(`voice: ${e.message}`);
        }
      }
    }
  } else if (input.startsWith("/model")) {
    agent.model = input.split(" ")[1] ?? agent.model;
    logger.model(agent.model);
    ui.log(`model: ${agent.model}`);
  } else {
    await runAgent(input);
  }
  if (closing) break;
}

await shutdown();
process.exit(0);
