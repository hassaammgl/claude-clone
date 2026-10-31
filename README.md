# noni-chan (Agentic Coding CLI)

Noni is a terminal coding agent: web search/fetch, docs guard, nested todos, background jobs, MCP tools, and a small-model-friendly TUI.

## Run from npm

```bash
npm install -g noni-chan
noni-chan
```

Ya bina install:

```bash
npx noni-chan
# or
bunx noni-chan
```

Noni **Bun** par chalti hai (npm wrapper Bun ko call karta hai). Bun na ho to:

```bash
curl -fsSL https://bun.sh/install | bash
```

Ollama local hone chahiye (`ollama serve`). Pehli baar model picker aayega.

## Local development

```bash
bun install
bun run dev
```

Tests aur typecheck:

```bash
bun test
bun run typecheck
```

## Useful environment variables

```bash
OLLAMA_MODEL=qwen3.5:0.8b     # picker skip
OLLAMA_NUM_CTX=32768          # context cap (default: model max)
OLLAMA_NUM_PREDICT=4096
OLLAMA_TEMPERATURE=0.4
SEARXNG_URL=http://localhost:8080
NONI_LOG_DIR=/path/to/logs    # default: ./logs
```

Logs are JSONL, one file per session. In the TUI use `/logs` or `/logs 50`.
