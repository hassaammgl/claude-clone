import { join } from "node:path";
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
import { SessionLogger } from "./src/log/SessionLogger";
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

const cwd = process.cwd();
const logger = new SessionLogger(cwd);
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
  ...(await mcp.load(join(cwd, "mcp.json"))),
);

let busy = false;
let closing = false;
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
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

logger.sessionStart(agent.model, agent.listTools().length);
ui.banner(agent.model, agent.listTools().length, todos.size);

while (true) {
  let input: string;
  try {
    input = await ui.prompt();
  } catch {
    break;
  }
  if (!input) continue;
  logger.input(input);

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
        "/logs [n]        last n log lines + file path",
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
        ui.error(e.message);
      }
    }
  } else if (input === "/logs" || input.startsWith("/logs ")) {
    const n = Number(input.split(/\s+/)[1]) || 20;
    const lines = await logger.tail(n);
    ui.log(`log: ${logger.path}\n${lines.join("\n") || "(empty)"}`);
  } else if (input.startsWith("/model")) {
    agent.model = input.split(" ")[1] ?? agent.model;
    logger.model(agent.model);
    ui.log(`model: ${agent.model}`);
  } else {
    busy = true;
    try {
      await agent.run(input);
    } catch (e: any) {
      logger.error(e.message);
      ui.error(e.message);
    } finally {
      busy = false;
    }
  }
  if (closing) break;
}

await shutdown();
process.exit(0);
