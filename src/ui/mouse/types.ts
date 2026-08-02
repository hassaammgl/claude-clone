export type MouseButton = "left" | "middle" | "right" | "none";

export type MouseEventType =
  | "press"
  | "release"
  | "move"
  | "scroll-up"
  | "scroll-down";

/** Terminal mouse event — coordinates are 0-based. */
export interface TerminalMouseEvent {
  x: number;
  y: number;
  button: MouseButton;
  type: MouseEventType;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return (
    x >= rect.x &&
    x < rect.x + rect.width &&
    y >= rect.y &&
    y < rect.y + rect.height
  );
}
