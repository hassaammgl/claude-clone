import * as readline from "readline";
import { AgentLoop } from "./loop";
import { createContext } from "./context";
import { PermissionChoice } from "../permissions/engine";

export async function runHeadless(initialPrompt?: string) {
  console.log("========================================");
  console.log("🤖 HERO-CLI v1.0.0 (HEADLESS)");
  console.log(`📂 CWD: ${process.cwd()}`);
  console.log("🛠️  27 Tools Loaded");
  console.log("========================================\n");

  const context = createContext(initialPrompt);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const loop = new AgentLoop(context, {
    onStreamContent: (text) => {
      // In headless mode, we might not want to stream every single chunk to avoid cluttering pipes
    },
    onStreamComplete: (fullText) => {
      process.stdout.write(`\nHero: ${fullText}\n`);
    },
    onWaitUserInput: () => {
      process.stdout.write("\n> ");
    },
    onAskPermission: (toolName, input, resolve) => {
      console.log(`\n⚠️ Permission Required: ${toolName}`);
      console.log(`Input: ${JSON.stringify(input, null, 2)}`);
      
      const askRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      askRl.question("Allow once (1) / Allow always (2) / Deny (3)? ", (answer) => {
        askRl.close();
        if (answer === "1") resolve("allow_once");
        else if (answer === "2") resolve("allow_always");
        else resolve("deny");
      });
    },
    onAskUserQuestion: (question, options, resolve) => {
      console.log(`\n❓ Hero is asking: ${question}`);
      options.forEach((opt, i) => console.log(`[${i + 1}] ${opt}`));
      
      const askRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      askRl.question("Enter number: ", (answer) => {
        askRl.close();
        const idx = parseInt(answer, 10);
        const choice = (idx >= 1 && idx <= options.length) ? options[idx - 1] : options[0];
        resolve(choice);
      });
    },
    onError: (error) => {
      console.error(`\n❌ Error: ${error.message}`);
    }
  });

  if (initialPrompt) {
    await loop.start();
  }

  rl.on("line", (line) => {
    if (line.trim()) {
      loop.submitUserMessage(line);
    }
  });
}
