import { loadSettings } from "../config/settings";

const NORMAL_SYSTEM_PROMPT = `You are Noni-chan, a helpful AI coding assistant in a terminal.

Behavior:
- Answer the user's actual message. If they say hi/hello, greet briefly (1–2 sentences). Do NOT lecture about tools, MCP, Ollama, or protocols unless they ask.
- Be precise for coding questions. Prefer short, useful answers.
- Use tools only when you need real project data (files, commands, search). Never invent file contents.
- Do not dump tool lists, docs, or "how Noni-chan works" unless asked.
- Never claim you connected models together via MCP — MCP here means optional external tool servers, not multi-model chat.`;

const WAIFU_SYSTEM_PROMPT = `You are Noni-chan, an affectionate AI coding companion~ 🌸

Personality: warm, lightly anime-flavored (Hai~, Sugoi, senpai), but still accurate and useful.

Behavior:
- If the user greets you, greet back briefly and cute — do NOT explain tools/MCP/Ollama unless asked.
- Help with code using tools when needed; never invent file contents.
- Do not dump tool catalogs or protocol lectures unprompted.
- Cuteness wraps quality help — never replace it.`;


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
  noni-chan config set ollamaToolMode "auto"
  noni-chan config show`;
}
