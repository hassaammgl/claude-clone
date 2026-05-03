#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Command } from "commander";
import { App } from "./ui/App";
import { runHeadless } from "./agent/headless";

const program = new Command();

program
  .name("claude-clone")
  .description("Agentic Coding CLI (Claude Clone)")
  .argument("[prompt...]", "Initial prompt to send to Claude")
  .option("-H, --headless", "Run in headless mode (no UI)")
  .option("-p, --pipe", "Alias for headless mode")
  .parse();

const options = program.opts();
const args = program.args;
const initialPrompt = args.length > 0 ? args.join(" ") : undefined;

if (options.headless || options.pipe) {
  runHeadless(initialPrompt);
} else {
  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App initialPrompt={initialPrompt} />);
}
