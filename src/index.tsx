#!/usr/bin/env bun
import { render } from "ink";
import { Command } from "commander";
import App from "./ui/App";
import { runHeadless } from "./agent/headless";
import {
  loadSettings,
  saveSettings,
  getSettingsFilePath,
} from "./config/settings";

const program = new Command();

program.name("hero-cli").description("Agentic Coding CLI (Hero CLI)");
program.addHelpText(
  "after",
  `\nExamples:\n  hero-cli config set anthropicApiKey "YOUR_ANTHROPIC_KEY"\n  hero-cli config set geminiApiKey "YOUR_GEMINI_KEY"\n  hero-cli config set openaiApiKey "YOUR_OPENAI_KEY"\n  hero-cli config set openaiModel "gpt-4o-mini"\n  hero-cli config set ollamaBaseUrl "https://your-ollama-host.example.com"\n  hero-cli config set ollamaModel "llama3.1:8b"\n\n  hero-cli config show\n  hero-cli --headless "Hello"\n`,
);

const configCmd = program
  .command("config")
  .description(
    "View/update hero-cli configuration (stores keys cross-platform)",
  );

configCmd
  .command("show")
  .description("Print the current settings file path and contents")
  .action(() => {
    const settings = loadSettings();
    process.stdout.write(`Settings file: ${getSettingsFilePath()}\n\n`);
    process.stdout.write(`${JSON.stringify(settings, null, 2)}\n`);
    process.exit(0);
  });

configCmd
  .command("set")
  .description("Set a config value")
  .argument(
    "<key>",
    "Config key (e.g. anthropicApiKey, geminiApiKey, openaiApiKey, ollamaBaseUrl)",
  )
  .argument("<value>", "Value to set")
  .action((key: string, value: string) => {
    const settings: any = loadSettings();
    settings[key] = value;
    saveSettings(settings);
    process.stdout.write(`Saved ${key} to ${getSettingsFilePath()}\n`);
    process.exit(0);
  });

program
  .command("run [prompt...]", { isDefault: true })
  .description("Start an interactive session")
  .option("-H, --headless", "Run in headless mode (no UI)")
  .option("-p, --pipe", "Alias for headless mode")
  .action(
    (
      promptParts: string[] = [],
      options: { headless?: boolean; pipe?: boolean },
    ) => {
      const initialPrompt =
        promptParts.length > 0 ? promptParts.join(" ") : undefined;

      const stdinAny = process.stdin as unknown as {
        isTTY?: boolean;
        setRawMode?: (enabled: boolean) => void;
      };
      const canUseInkUi =
        Boolean(stdinAny.isTTY) && typeof stdinAny.setRawMode === "function";

      if (options.headless || options.pipe || !canUseInkUi) {
        if (!options.headless && !options.pipe && !canUseInkUi) {
          console.error(
            "Ink UI disabled: stdin raw mode not supported. Falling back to headless mode.",
          );
        }
        runHeadless(initialPrompt);
      } else {
        render(<App initialPrompt={initialPrompt} />);
      }
    },
  );

program.parse();
