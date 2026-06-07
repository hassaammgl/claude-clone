# noni-chan (Agentic Coding CLI)

To install dependencies:

```bash
bun install
```

To run:

```bash
bun dev
```

This CLI renders a terminal UI using [Ink](https://github.com/vadimdemedes/ink) (React for CLIs).

### Model providers

The agent will pick the first configured provider in this order (env vars override config):

- **Claude (Anthropic)**: set `ANTHROPIC_API_KEY`
- **Gemini (Google)**: set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
- **OpenAI**: set `OPENAI_API_KEY` (optional `OPENAI_BASE_URL`, `OPENAI_MODEL`)
- **Ollama (hosted/self-hosted)**: set `OLLAMA_BASE_URL` and `OLLAMA_MODEL`
  - Optional: `OLLAMA_API_KEY` (only if your hosted Ollama requires auth)

### Store keys in a config file (recommended for npx)

`noni-chan` stores settings in a cross-platform location:

- **Windows**: `%APPDATA%\\noni-chan\\settings.json`
- **macOS**: `~/Library/Application Support/noni-chan/settings.json`
- **Linux**: `$XDG_CONFIG_HOME/noni-chan/settings.json` (or `~/.config/noni-chan/settings.json`)

Set values:

```bash
noni-chan config set anthropicApiKey "YOUR_ANTHROPIC_KEY"
noni-chan config set geminiApiKey "YOUR_GEMINI_KEY"
noni-chan config set openaiApiKey "YOUR_OPENAI_KEY"
noni-chan config set openaiModel "gpt-4o-mini"
noni-chan config set ollamaBaseUrl "https://your-ollama-host.example.com"
noni-chan config set ollamaModel "llama3.1:8b"
```

Show current config:

```bash
noni-chan config show
```

#### Hosted Ollama example

PowerShell:

```bash
$env:OLLAMA_BASE_URL="https://your-ollama-host.example.com"
$env:OLLAMA_MODEL="llama3.1:8b"
# optional if your host requires it:
$env:OLLAMA_API_KEY="YOUR_TOKEN"

bun dev --headless "Hello! Say hi in one sentence."
```
