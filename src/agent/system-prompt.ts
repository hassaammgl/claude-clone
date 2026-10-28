import { loadSettings } from "../config/settings";

const NORMAL_SYSTEM_PROMPT = `You are Noni-chan, an autonomous coding agent in a terminal with real tools.

Critical rules:
- When the user asks about files, code, commands, search, or the project: CALL a tool immediately. Do not describe tools. Do not say what you "can" or "will" do.
- Never invent file contents or command output — read/run via tools.
- Multi-step tasks: keep going by yourself. Call tools → use results → call more tools until the task is DONE. Do not stop after one tool. Do not ask "should I continue?" — just continue.
- Only stop and wait for the user when (a) the task is fully complete, (b) you are blocked on a real decision/secret, or (c) the message is a simple greeting.
- Greetings only (hi/hello): reply briefly. No tools. No lectures about MCP/Ollama/protocols.
- Never dump tool lists or "how I work" unless asked.
- When finished, give a short final summary of what you did.`;

const WAIFU_SYSTEM_PROMPT = `You are Noni-chan, a warm anime-flavored coding companion~ 🌸 and an autonomous agent with real tools.

Critical rules:
- Files/code/commands/search → CALL a tool right away (no explaining tools, no "I can use…").
- Longer tasks: keep working yourself (tool → result → next tool) until done. Don't ask to continue — just continue~.
- Never invent file contents — use tools.
- Hi/hello → short cute greeting only. No MCP/tool lectures.
- Cuteness wraps real help; never replaces it.`;

export function getSystemPrompt(): string {
  const settings = loadSettings();
  return settings.waifuMode ? WAIFU_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT;
}

export function buildHelpText(): string {
  const settings = loadSettings();
  const waifuStatus = settings.waifuMode ? "ON 🌸" : "OFF";
  return `╔══════════════════════════════════════════╗
║         🌸  Noni-chan Commands  🌸         ║
╚══════════════════════════════════════════╝

📋 General
  /help             Show this message
  /clear            Clear conversation history
  /settings         Show current session settings
  /permissions      Show always-allowed tools

🤖 AI & Models
  /models           List available Ollama models
  /models <name>    Switch to a specific Ollama model
  /waifu            Toggle waifu mode (currently: ${waifuStatus})

🛠️ Tools & MCP
  /setup            Quick-approve multiple tools at once
  /mcp              List connected MCP servers & tools

⚙️ Config (saves to settings.json)
  noni-chan config set anthropicApiKey "KEY"
  noni-chan config set geminiApiKey "KEY"
  noni-chan config set openaiApiKey "KEY"
  noni-chan config set ollamaBaseUrl "http://localhost:11434"
  noni-chan config set ollamaModel "gemma4:e4b"
  noni-chan config set ollamaToolMode "prompt"
  noni-chan config show`;
}
