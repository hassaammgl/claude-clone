# noni-chan

**Agentic coding CLI for the terminal.** Local Ollama models, web search, docs-aware edits, nested todos, background jobs, MCP tools, and a small-model-friendly TUI.

Noni runs on [Bun](https://bun.sh). The npm wrapper starts it for you.

## Quick start

Requirements:

- **Bun** 1.1+
- **Ollama** running locally (`ollama serve`)
- Optional: **SearXNG** for web search (DuckDuckGo fallback works without it)

```bash
# Bun install (if you don't have it)
curl -fsSL https://bun.sh/install | bash

# install Noni
npm install -g noni-chan

# or run without installing
npx noni-chan
```

Pull a model if needed:

```bash
ollama pull qwen3.5:0.8b
noni-chan
```

First launch shows a model picker. `Enter` picks the smallest installed chat model.

## Features

- **Local-first** — talks to Ollama; no cloud key required.
- **Model picker** — choose at startup or switch with `/model`.
- **Web search + fetch** — SearXNG first, DuckDuckGo fallback, readable page extraction.
- **Docs guard** — blocks JS/TS/Python edits that add a new third-party import until `read_docs` was called.
- **Nested todos** — plan tasks and subtasks, iterate with `next`/`done`.
- **Background jobs** — long builds keep running; wait, check status, or kill them.
- **MCP tools** — load extra tools from `mcp.json`.
- **Session logs** — JSONL logs for inputs, tool calls, results, jobs and errors.
- **Small-model friendly TUI** — compact output, previews before risky edits, spinner with elapsed time.

## Commands

| Command | Kaam |
|---|---|
| `/help` | command list |
| `/tools` | tools and dangerous markers |
| `/todos` | current task tree |
| `/todos clear` | clear the plan |
| `/jobs` | background jobs |
| `/jobs kill <id>` | stop a background job |
| `/logs [n]` | last n log lines + log file path |
| `/model <name>` | switch model |
| `/clear` | clear chat history (plan stays) |
| `/think` | toggle model thinking |
| `/exit` | quit |

## Tools

| Tool | What it does |
|---|---|
| `read_file`, `list_dir` | read files / list folders |
| `write_file`, `edit_file`, `delete_file` | modify workspace files (confirm + preview) |
| `bash` | shell commands; long ones move to background jobs |
| `glob`, `grep` | find files / search contents |
| `web_search`, `web_fetch` | search and read pages |
| `read_docs` | local package → pydoc/go doc/man/headers → npm/PyPI → web |
| `todo` | nested plan: `plan`, `add`, `next`, `done`, `update`, `remove`, `clear` |
| `system_info` | OS, CPU, RAM, disk, battery, uptime |
| MCP tools | anything enabled in `mcp.json` |

### Docs guard

A JS/TS/Python file that newly imports a third-party package is blocked until you call:

```json
{"name":"zod","language":"js"}
```

- C/C++ files are exempt.
- Python stdlib and local modules are exempt.
- If docs cannot be found, the library is marked read so the agent is not deadlocked.
- Each package is blocked at most twice, then the edit is allowed.

### Todos

```json
{"action":"plan","outline":"1. Build API\n  1.1 Routes\n  1.2 Validation\n2. Test"}
```

```json
{"action":"next"}
{"action":"done","id":"1.1"}
{"action":"add","parent_id":"1","title":"Error handling"}
```

### Background jobs

`bash` waits 30s by default. If a command is still running, it is **not killed** — it becomes a job:

```json
{"action":"wait","job_id":"1","timeout_seconds":120}
{"action":"status","job_id":"1"}
{"action":"list"}
{"action":"kill","job_id":"1"}
```

The agent can work on other todos while a job runs. Jobs are stopped when the app exits.

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API |
| `OLLAMA_MODEL` | — | skip the model picker |
| `OLLAMA_NUM_CTX` | model max | context window cap |
| `OLLAMA_NUM_PREDICT` | `4096` | max generated tokens |
| `OLLAMA_TEMPERATURE` | `0.4` | sampling temperature |
| `SEARXNG_URL` | `http://localhost:8080` | SearXNG instance |
| `NONI_LOG_DIR` | `./logs` | session log directory |

MCP servers are read from `mcp.json` in the working directory.

## Logs

Every session writes JSONL to `logs/session-<timestamp>-<pid>.jsonl` (ignored by git). Events include inputs, commands, assistant messages, tool calls, tool results, job start/finish and errors.

```bash
/logs
/logs 50
```

## Local development

```bash
bun install
bun run dev      # watch mode
bun run start    # run once
bun test
bun run typecheck
```

Project layout:

```
index.ts              entry point + command loop
src/agent/            agent loop, guards, persona
src/tools/            built-in tools
src/docs/             docs sources + DocsGuard
src/todos/            nested task store
src/jobs/             background job manager
src/log/              JSONL session logger
src/search/           search providers + fallback engine
src/ui/               terminal UI
test/                 unit + integration tests
```

## Troubleshooting

**`noni-chan: command not found`** — install globally with `npm i -g noni-chan`, or run `npx noni-chan`.

**Bun is missing** — the npm wrapper prints the install command. Install Bun from https://bun.sh.

**Ollama not reachable** — start it with `ollama serve` and check `curl http://127.0.0.1:11434/api/tags`.

**Old version from `npx`** — npm caches packages. Force it:

```bash
npx --yes noni-chan@latest
# or
npm cache clean --force
```

**Replies cut short** — the model hit its context/output limit. Use `/clear`, raise `OLLAMA_NUM_CTX`, or raise `OLLAMA_NUM_PREDICT`.

## Limitations

- Ollama is the only provider right now (no Anthropic/Gemini/OpenAI adapters yet).
- The docs guard sees import lines, not every dynamic API use.
- Very small models can still produce malformed tool calls. 2B+ models are more reliable.
