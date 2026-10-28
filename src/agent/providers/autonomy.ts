import type { Message } from "../messages";
import { messageText } from "./types";

export const MAX_AGENT_TURNS = 25;

export const CONTINUE_NUDGE = `[continue] Keep working on the user's task autonomously.
- If more work remains, emit <tool_call> block(s) NOW.
- If the task is fully complete, reply with a short final summary only.
- Do NOT ask the user what to do next. Do NOT stop after one tool unless the task is done.`;

export function isInternalNudge(text: string): boolean {
  const t = text.trim();
  return (
    t.startsWith("[continue]") ||
    t.startsWith("STOP. Do not explain tools") ||
    t.includes("Emit ONLY one or more <tool_call>")
  );
}

/** Last real user goal (skips internal nudges). */
export function findUserGoal(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const text = messageText(msg.content).trim();
    if (!text || isInternalNudge(text)) continue;
    return text;
  }
  return "";
}

export function isSimpleChat(goal: string): boolean {
  const t = goal.trim();
  if (!t) return true;
  if (t.startsWith("/")) return true;
  if (
    /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|bye)\b/i.test(t) &&
    t.length < 48
  ) {
    return true;
  }
  return false;
}

export function isMultiStepGoal(goal: string): boolean {
  if (isSimpleChat(goal)) return false;
  if (goal.length > 100) return true;
  return /\b(fix|implement|add|create|build|refactor|update|migrate|rewrite|improve|make|change|debug|investigate|set\s*up|setup|wire|integrate|replace|remove|delete|rename|move|port|optimize|test|write|edit|patch|complete|finish|do all|then|and then|step by step)\b/i.test(
    goal,
  );
}

export function recentToolActivity(messages: Message[], lookback = 8): boolean {
  const slice = messages.slice(-lookback);
  return slice.some(
    (m) =>
      m.role === "tool" ||
      (m.role === "assistant" &&
        Array.isArray(m.tool_calls) &&
        m.tool_calls.length > 0),
  );
}

export function responseLooksFinished(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (
    /\b(would you like|should I|want me to|let me know|what would you|shall I|do you want me)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return /\b(done|completed|finished|all set|task (is )?complete|here'?s (the )?summary|final (answer|summary)|command (ran|executed|completed)|output:|stdout)\b/i.test(
    t,
  );
}

/**
 * After a text-only turn, decide whether to push a continue nudge.
 * Be conservative — endless continue leaves the UI stuck on "thinking".
 */
export function shouldContinueAutonomously(options: {
  goal: string;
  assistantText: string;
  messages: Message[];
  turn: number;
  maxTurns: number;
}): boolean {
  const { goal, assistantText, messages, turn, maxTurns } = options;
  if (turn >= maxTurns) return false;
  if (isSimpleChat(goal)) return false;

  const text = assistantText.trim();
  if (responseLooksFinished(text)) return false;

  const toolsRecently = recentToolActivity(messages);
  const multi = isMultiStepGoal(goal);

  // Model deferred to the user instead of acting — nudge once.
  if (
    /\b(would you like|should I|want me to|let me know|what would you|shall I)\b/i.test(
      text,
    )
  ) {
    return turn < 8;
  }

  // After tools: only continue if the model barely answered (likely stalled).
  if (toolsRecently) {
    if (!text) return true;
    if (text.length < 48 && multi) return true;
    // Real answer after command/tool → stop and wait for user.
    return false;
  }

  // Multi-step with no tools yet and almost no reply — nudge to start tools.
  if (multi && text.length < 40 && turn < 4) return true;

  return false;
}
