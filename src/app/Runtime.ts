import { Ollama } from "ollama";
import { Agent, type AgentUI } from "../agent/Agent";
import type { NoniConfig } from "../config/Config";
import { loadConfig } from "../config/Config";
import { DocsGuard, DocsRegistry } from "../docs/DocsGuard";
import { HistoryStore, type HistoryMessage } from "../history/HistoryStore";
import { NodeModulesSource, SystemSource } from "../docs/LocalSources";
import { RegistrySource, WebDocsSource } from "../docs/RemoteSources";
import { JobManager } from "../jobs/JobManager";
import { McpManager } from "../mcp/McpManager";
import { DuckDuckGoProvider } from "../search/DuckDuckGoProvider";
import { SearchEngine } from "../search/SearchEngine";
import { SearxngProvider } from "../search/SearxngProvider";
import { TodoStore } from "../todos/TodoStore";
import { AskUserTool } from "../tools/AskUserTool";
import { BashTool } from "../tools/BashTool";
import { ReadDocsTool } from "../tools/DocsTool";
import {
    DeleteFileTool,
    EditFileTool,
    ListDirTool,
    MakeDirTool,
    MoveFileTool,
    ReadFileTool,
    ReplaceLinesTool,
    WriteFileTool,
} from "../tools/FileTool";
import { GitTool } from "../tools/GitTool";
import { GlobTool, GrepTool } from "../tools/SearchTools";
import { SystemInfoTool } from "../tools/SystemTool";
import { TodoTool } from "../tools/TodoTool";
import { WebFetchTool, WebSearchTool } from "../tools/WebTools";

/** UI jo runtime ko chahiye: Agent ke callbacks + ask_user ke liye ek sawaal. */
export type RuntimeUI = AgentUI & {
    ask(question: string, options?: string[]): Promise<string>;
};

export interface RuntimeOptions {
    cwd: string;
    model: string;
    ui: RuntimeUI;
}

export interface Runtime {
    cwd: string;
    ollama: Ollama;
    jobs: JobManager;
    agent: Agent;
    todos: TodoStore;
    docs: DocsRegistry;
    search: SearchEngine;
    mcp: McpManager;
    config: NoniConfig;
    configError?: string;
    /** Runtime banate waqt di gayi UI (TUI ya web). */
    ui: RuntimeUI;
    /** SQLite chat history (sessions + messages). */
    history: HistoryStore;
    /** Abhi kaunsi history session me likh rahe hain. */
    sessionId: number;
    newSession(): number;
    loadSession(id: number): HistoryMessage[];
    /** Ek waqt me ek hi agent run (TUI ya web client). */
    runLock: RunLock;
    shutdown(): Promise<void>;
}

/** Simple mutex: TUI aur web client ek saath agent na chalayen. */
export class RunLock {
    private locked = false;

    get busy() {
        return this.locked;
    }

    tryAcquire(): boolean {
        if (this.locked) return false;
        this.locked = true;
        return true;
    }

    release() {
        this.locked = false;
    }
}

/**
 * TUI aur web server dono ke liye ek hi agent/tool stack banao.
 * UI inject hoti hai, isliye same tools terminal aur browser dono me chalte hain.
 */
export async function createRuntime({ cwd, model, ui }: RuntimeOptions): Promise<Runtime> {
    const jobs = new JobManager();
    const ollama = new Ollama({
        host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
    });
    const mcp = new McpManager();

    const { config, error: configError } = await loadConfig();
    const agent = new Agent(ollama, model, ui, cwd, config.llm);
    const runLock = new RunLock();
    const history = new HistoryStore();
    let sessionId = history.createSession({ model, cwd });
    agent.onMessage((msg) => history.append(sessionId, msg));

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

    const runtime: Runtime = {
        cwd,
        ollama,
        jobs,
        agent,
        todos,
        docs,
        search,
        mcp,
        config,
        configError,
        ui,
        history,
        sessionId,
        newSession() {
            sessionId = history.createSession({ model: agent.model, cwd });
            agent.reset();
            runtime.sessionId = sessionId;
            return sessionId;
        },
        loadSession(id) {
            if (!history.get(id)) throw new Error(`history session #${id} nahi mila`);
            const messages = history.messages(id);
            sessionId = id;
            agent.loadHistory(messages);
            runtime.sessionId = id;
            return messages;
        },
        runLock,
        async shutdown() {
            history.close();
            await jobs.closeAll();
            await mcp.close();
        },
    };

    return runtime;
}
