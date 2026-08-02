import type { MouseButton, TerminalMouseEvent } from "./types";

const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

function buttonFromCb(cb: number): MouseButton {
  const code = cb & 3;
  if (code === 0) return "left";
  if (code === 1) return "middle";
  if (code === 2) return "right";
  return "none";
}

/** Parse one or more SGR mouse reports from a stdin chunk. */
export function parseSgrMouseEvents(chunk: string): TerminalMouseEvent[] {
  const events: TerminalMouseEvent[] = [];
  SGR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SGR_RE.exec(chunk)) !== null) {
    const cb = Number(match[1]);
    const x = Number(match[2]) - 1;
    const y = Number(match[3]) - 1;
    const action = match[4];

    if (!Number.isFinite(cb) || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    // Wheel: 64 = up, 65 = down (modifier bits may be set).
    if (cb & 64) {
      events.push({
        x,
        y,
        button: "none",
        type: cb & 1 ? "scroll-down" : "scroll-up",
      });
      continue;
    }

    const moving = (cb & 32) !== 0;
    if (moving) {
      events.push({
        x,
        y,
        button: buttonFromCb(cb),
        type: "move",
      });
      continue;
    }

    events.push({
      x,
      y,
      button: buttonFromCb(cb),
      type: action === "m" ? "release" : "press",
    });
  }
  return events;
}

/** True if a key/input string looks like a leaked SGR mouse CSI payload. */
export function looksLikeMouseLeak(input: string): boolean {
  return (
    input.includes("\x1b[<") ||
    /^\[<\d+;\d+;\d+[Mm]/.test(input) ||
    /\[<\d+;\d+;\d+[Mm]/.test(input)
  );
}
