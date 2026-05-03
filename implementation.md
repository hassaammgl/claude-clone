Perfect. Here's the full implementation plan.

---

## Project: Agentic Coding CLI (Claude Code Clone) — Node.js/TypeScript

---

### Architecture Overview

```
my-code-cli/
├── src/
│   ├── cli.ts              # Entry point
│   ├── agent/
│   │   ├── loop.ts         # Main agentic loop
│   │   └── context.ts      # Session state
│   ├── tools/              # One file per tool
│   ├── permissions/        # Permission engine
│   ├── mcp/                # MCP client
│   └── ui/                 # Terminal UI (ink)
├── package.json
└── tsconfig.json
```

---

### Phase 1 — Project Scaffold & Core Infrastructure

**Goal:** Runnable CLI shell with no tools yet.

**Tasks:**

1. Init repo: `npm init`, `tsconfig.json`, `eslint`, `prettier`
2. Install core deps: `typescript`, `tsx`, `commander` (CLI args), `ink` + `react` (terminal UI), `@anthropic-ai/sdk`
3. Build `cli.ts` — parses args, starts session
4. Build `agent/context.ts` — holds conversation history, working directory, session ID, tool results
5. Build `agent/loop.ts` — the core loop:
   - Send messages to Claude API
   - Receive response
   - If `stop_reason === "tool_use"` → dispatch tool → append result → loop again
   - If `stop_reason === "end_turn"` → print response, wait for next user input
6. Build basic `ui/` with `ink` — shows user prompt, streaming output, tool call indicators

**Deliverable:** You can chat with Claude in terminal. No tools yet.

---

### Phase 2 — Permission Engine

**Goal:** Before any tool runs, check if it's allowed.

**Tasks:**

1. Create `permissions/engine.ts`:
   - Loads allow/deny rules from `~/.config/my-code-cli/settings.json`
   - `checkPermission(toolName, input): "allow" | "deny" | "ask"`
2. Create `permissions/prompt.ts`:
   - When result is `"ask"`, render an interactive ink prompt: `Allow once / Allow always / Deny`
3. Wire permission check into `agent/loop.ts` before every tool dispatch

**Deliverable:** Every tool call goes through permission gate.

---

### Phase 3 — File Tools (Read, Write, Edit, Glob)

Build in this order:

#### Tool 1: `Read`

- Input: `file_path`, optional `start_line`, `end_line`
- Implementation: `fs.readFile`, slice lines if range given
- Returns: file contents as string with line numbers

#### Tool 2: `Write`

- Input: `file_path`, `content`
- Implementation: `fs.writeFile` (creates or overwrites)
- Permission: **Yes** — always ask first time

#### Tool 3: `Edit`

- Input: `file_path`, `old_str`, `new_str`
- Implementation: read file → find exact match of `old_str` → replace with `new_str` → write back
- Error if `old_str` not found or appears more than once

#### Tool 4: `Glob`

- Input: `pattern`, optional `base_dir`
- Implementation: use `fast-glob` npm package
- Returns: array of matched file paths

**Deliverable:** Claude can read, write, and edit files in your project.

---

### Phase 4 — Search Tools (Grep, LSP-lite)

#### Tool 5: `Grep`

- Input: `pattern`, `path`, optional `file_glob`
- Implementation: spawn `rg` (ripgrep) as child process, fall back to custom JS regex walker if rg not installed
- Returns: matches with file path + line number + line content

#### Tool 6: `LSP` (simplified)

- Full LSP is complex — start with a lite version:
  - Input: `action` (`diagnostics` | `definition` | `references`), `file_path`, optional `line`/`col`
  - Implementation: use `vscode-languageclient` or spawn `typescript-language-server` as child process via stdio
  - Wire up only `textDocument/diagnostics` and `textDocument/definition` to start
- This is the hardest tool — timebox it, ship diagnostics first

**Deliverable:** Claude can search code and get type errors.

---

### Phase 5 — Shell Execution (Bash)

#### Tool 7: `Bash`

- Input: `command`, `description`
- Implementation:
  - Spawn child process via `node:child_process` `spawn`
  - Stream stdout/stderr live to terminal UI
  - Working directory persists across calls (store in `context.ts`)
  - Timeout after configurable limit (default 120s)
  - Strip ANSI if needed for Claude's context
- Permission: **Yes** — most dangerous tool, always prompt

**Deliverable:** Claude can run git, npm, tests, etc.

---

### Phase 6 — Task Management Tools

#### Tool 8: `TaskCreate`

- Input: `content`, `status` (pending/in_progress/done)
- Implementation: in-memory array in `context.ts`

#### Tool 9: `TaskList`

- Returns: full task array

#### Tool 10: `TaskGet`

- Input: `task_id`
- Returns: single task detail

#### Tool 11: `TaskUpdate`

- Input: `task_id`, fields to update
- Mutates in-memory task

#### Tool 12: `TaskStop` / `TaskDelete`

- Removes or cancels task

#### Tool 13: `TodoWrite` (non-interactive/headless mode)

- Same as above but single-call batch write of entire todo list
- Used when running in `--headless` / pipe mode

**Deliverable:** Claude can plan and track multi-step work.

---

### Phase 7 — Scheduler Tools (Cron)

#### Tool 14: `CronCreate`

- Input: `prompt`, `schedule` (cron expression or `"once"`)
- Implementation: use `node-cron` package, store jobs in session map

#### Tool 15: `CronList`

- Returns: all active cron jobs

#### Tool 16: `CronDelete`

- Input: `cron_id`
- Stops and removes the job

**Deliverable:** Claude can schedule recurring tasks within a session.

---

### Phase 8 — Web Tools (WebFetch, WebSearch)

#### Tool 17: `WebFetch`

- Input: `url`
- Implementation: `fetch()` → extract readable text via `@mozilla/readability` + `jsdom`
- Truncate to token limit before returning to Claude

#### Tool 18: `WebSearch`

- Input: `query`, optional `allowed_domains`, `blocked_domains`
- Implementation: call a search API — use Brave Search API or Serper.dev (both have free tiers)
- Returns: top N results with title, URL, snippet

**Deliverable:** Claude can look things up on the web.

---

### Phase 9 — Plan Mode

#### Tool 19: `EnterPlanMode`

- Sets a flag in `context.ts`: `planMode = true`
- In plan mode: `Write`, `Edit`, `Bash` are all blocked (permission engine denies them)
- Claude can only read/search/think

#### Tool 20: `ExitPlanMode`

- Renders the plan Claude produced as a formatted summary in the UI
- Prompts user: `Approve and execute? [Y/n]`
- On approval: sets `planMode = false`, re-runs with execution allowed

**Deliverable:** Claude plans first, executes only after approval.

---

### Phase 10 — Git Worktree Tools

#### Tool 21: `EnterWorktree`

- Input: `branch_name`
- Implementation: run `git worktree add <path> <branch>` via Bash
- Updates `context.ts` working directory to the new worktree path

#### Tool 22: `ExitWorktree`

- Runs `git worktree remove` and resets working dir in context

**Deliverable:** Claude can work in isolated branches simultaneously.

---

### Phase 11 — Agent/Subagent Tools

#### Tool 23: `Agent` (Task tool)

- Input: `subagent_type`, `prompt`, `tools` (subset)
- Implementation:
  - Spawn a new instance of `agent/loop.ts` with its own context
  - Pass it a subset of tools and the prompt
  - Stream its output back
  - Return final result to parent agent
- This enables parallelism — parent agent delegates subtasks

#### Tool 24: `AskUserQuestion`

- Input: `question`, `options[]`
- Implementation: render ink multi-choice prompt, return selected option to Claude

**Deliverable:** Claude can spawn sub-agents and ask clarifying questions.

---

### Phase 12 — MCP Client

#### Tools 25+: `ListMcpResourcesTool`, `ReadMcpResourceTool`, `ToolSearch`

- Implement MCP client in `mcp/client.ts`:
  - Connect to MCP servers via stdio or HTTP/SSE
  - Parse server's tool manifests
  - Dynamically register their tools into the tool dispatcher
- `ListMcpResourcesTool`: calls `resources/list` on connected servers
- `ReadMcpResourceTool`: calls `resources/read` on a URI
- `ToolSearch`: fuzzy-search over all registered MCP tool names + descriptions

**Deliverable:** Any MCP server (databases, APIs, etc.) plugs in automatically.

---

### Phase 13 — PowerShell Tool (Windows)

#### Tool 26: `PowerShell`

- Only activate if `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`
- Same as Bash but spawns `pwsh.exe` or `powershell.exe`
- Shares permission rules with Bash

---

### Phase 14 — Monitor Tool

#### Tool 27: `Monitor`

- Input: `command` to watch, `trigger_pattern`
- Implementation:
  - Spawn process, keep it running in background
  - Stream each output line through a pattern matcher
  - When pattern matches, send an event back into the agent loop as a new message

---

### Phase 15 — Polish & Ship

1. `~/.config/my-code-cli/settings.json` — full config support (model, permissions, env vars)
2. `CLAUDE.md` support — auto-read project context file at session start
3. `/commands` — slash commands (`/clear`, `/permissions`, `/mcp`, `/help`)
4. Conversation compaction — when context gets long, summarize old turns
5. `--headless` / `-p` flag — pipe mode for scripting (no ink UI)
6. Publish to npm: `npx my-code-cli`

---

### Build Order Summary

| Phase | Tools Built             | Complexity  |
| ----- | ----------------------- | ----------- |
| 1     | Scaffold + agent loop   | Medium      |
| 2     | Permission engine       | Medium      |
| 3     | Read, Write, Edit, Glob | Low         |
| 4     | Grep, LSP               | Medium-High |
| 5     | Bash                    | Medium      |
| 6     | Task tools (6 tools)    | Low         |
| 7     | Cron tools              | Low         |
| 8     | WebFetch, WebSearch     | Low         |
| 9     | PlanMode tools          | Low         |
| 10    | Worktree tools          | Low         |
| 11    | Agent, AskUserQuestion  | High        |
| 12    | MCP client + tools      | High        |
| 13    | PowerShell              | Low         |
| 14    | Monitor                 | Medium      |
| 15    | Polish + publish        | Medium      |

---

Kaunse phase se shuru karna chahte ho? Main wahan se detailed code likh sakta hun step by step.
