import { homedir } from "node:os";
import { extname, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
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
  MakeDirTool,
  MoveFileTool,
  ReadFileTool,
  ReplaceLinesTool,
  WriteFileTool,
} from "./src/tools/FileTool";
import { GitTool } from "./src/tools/GitTool";
import { AskUserTool } from "./src/tools/AskUserTool";
import { Tui } from "./src/ui/Tui";
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
import { loadConfig } from "./src/config/Config";
import { checkForUpdate, type UpdateInfo } from "./src/update/UpdateCheck";

const cwd = process.cwd();
const updatePromise = checkForUpdate();
const jobs = new JobManager();
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
});
const ui = new Tui();
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

// Global config (~/.config/noni-chan/config.json): model defaults + MCP servers
const { config, error: configError } = await loadConfig();
if (configError) ui.warn(`config.json padha nahi gaya (${configError}); defaults use kar rahi hoon`);

const agent = new Agent(ollama, await pickModel(), ui, cwd, config.llm);

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

const mcpTools = await mcp.load(config.mcp.servers);
agent.addTools(
  new ReadFileTool(cwd),
  new ListDirTool(cwd),
  new WriteFileTool(cwd),
  new EditFileTool(cwd),
  new ReplaceLinesTool(cwd),
  new MoveFileTool(cwd),
  new MakeDirTool(cwd),
  new GitTool(cwd),
  new AskUserTool((question, options) => ui.ask(question, options)),
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
  ...mcpTools,
);

let busy = false;
let closing = false;
let shuttingDown = false;

/** /img se attach hui image — agle message ke saath jati hai, phir clear */
let pendingImage: { path: string; base64: string; bytes: number } | null = null;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const fmtSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`);

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

/** Image file → base64. Log me sirf path/size jata hai, data kabhi nahi */
async function loadImage(raw: string) {
  const clean = raw.trim().replace(/^~(?=$|\/)/, homedir());
  const abs = resolve(cwd, clean);
  let info;
  try {
    info = await stat(abs);
  } catch {
    throw new Error(`image not found: ${clean}`);
  }
  if (!info.isFile()) throw new Error(`not a file: ${clean}`);
  const ext = extname(abs).toLowerCase();
  if (!IMAGE_MIME[ext]) throw new Error(`not an image (${ext || "no extension"}): ${clean}`);
  if (info.size > MAX_IMAGE_BYTES) throw new Error(`image too big: ${(info.size / 1e6).toFixed(1)} MB (max 10 MB)`);
  if (!(await agent.supportsVision())) {
    throw new Error(`model ${agent.model} vision support nahi karta; /model se vision wala model chuno`);
  }
  return { path: clean, base64: (await readFile(abs)).toString("base64"), bytes: info.size };
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await jobs.closeAll();
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

/** Ek hi latest version ka warning dobara na dikhe */
let notifiedVersion = "";
function showUpdate(info: UpdateInfo, force = false) {
  if (!force && notifiedVersion === info.latest) return;
  notifiedVersion = info.latest;
  ui.warn(`update available: ${info.current} → ${info.latest}`);
  ui.log(`install: bun add -g ${info.name}@latest`);
}

const UPDATE_INTERVAL_MS =
  Number(process.env.NONI_UPDATE_INTERVAL_MS) || 6 * 60 * 60 * 1000;
let lastUpdateCheck = Date.now();

const update = await updatePromise;
if (update.status === "update") showUpdate(update);

while (true) {
  // Long session me bhi naya version pakdo: har 6 ghante (ya env override) pe check
  if (Date.now() - lastUpdateCheck >= UPDATE_INTERVAL_MS) {
    lastUpdateCheck = Date.now();
    const refreshed = await checkForUpdate();
    if (refreshed.status === "update") showUpdate(refreshed);
  }

  let input: string;
  try {
    input = await ui.prompt();
  } catch {
    break;
  }
  if (!input) continue;

  if (input === "/exit") ui.close();
  else if (input === "/clear") {
    agent.reset();
    pendingImage = null;
  }
  else if (input === "/think") {
    agent.think = !agent.think;
    ui.log(`thinking: ${agent.think ? "ON" : "OFF"}`);
  } else if (input === "/update") {
    ui.log("checking npm for updates...");
    const result = await checkForUpdate();
    if (result.status === "update") showUpdate(result, true);
    else if (result.status === "current") ui.log(`up to date: ${result.name} ${result.current}`);
    else if (result.reason === "disabled") ui.warn("update check disabled (NONI_NO_UPDATE_CHECK)");
    else ui.warn("update check failed (offline ya npm registry down?)");
  } else if (input === "/help")
    ui.log(
      [
        "/help            ye list",
        "/tools           tools + dangerous markers",
        "/todos           current plan",
        "/todos clear     plan hatao",
        "/jobs            background jobs",
        "/jobs kill <id>  job band karo",
        "/img <path>      image agle message ke saath bhejo",
        "/img clear       pending image hatao",
        "/model <name>    model switch",
        "/clear           chat history clear (plan rehta hai)",
        "/think           thinking on/off",
        "/update          npm pe naya version check karo",
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
        ui.log(`job ${job.id}: ${job.status}`);
      } catch (e: any) {
        ui.error(e.message);
      }
    }
  } else if (input === "/img") {
    ui.log(
      pendingImage
        ? `image ready: ${pendingImage.path} (${fmtSize(pendingImage.bytes)}) — ab sawaal likho`
        : "usage: /img <path>   (agli message ke saath jayegi)",
    );
  } else if (input.startsWith("/img ")) {
    const arg = input.slice(4).trim();
    if (arg === "clear") {
      pendingImage = null;
      ui.log("image hata di");
    } else {
      try {
        pendingImage = await loadImage(arg);
        ui.log(`image ready: ${pendingImage.path} (${fmtSize(pendingImage.bytes)}) — ab sawaal likho`);
      } catch (e: any) {
        ui.error(e.message);
      }
    }
  } else if (input.startsWith("/model")) {
    agent.model = input.split(" ")[1] ?? agent.model;
    ui.log(`model: ${agent.model}`);
  } else {
    busy = true;
    const images = pendingImage ? [pendingImage.base64] : [];
    if (pendingImage) {
      ui.log(`+ image: ${pendingImage.path}`);
      pendingImage = null;
    }
    try {
      await agent.run(input, images);
    } catch (e: any) {
      ui.error(e.message);
    } finally {
      busy = false;
    }
  }
  if (closing) break;
}

await shutdown();
process.exit(0);
