import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useStdin } from "ink";
import { parseSgrMouseEvents } from "./parse";
import {
  disableMouseTracking,
  enableMouseTracking,
  forceDisableMouseTracking,
} from "./tracking";
import type { TerminalMouseEvent } from "./types";

type MouseHandler = (event: TerminalMouseEvent) => void;

interface MouseContextValue {
  subscribe: (handler: MouseHandler) => () => void;
}

const MouseContext = createContext<MouseContextValue | null>(null);

/**
 * Enables terminal mouse reporting and fans out parsed SGR events to subscribers.
 * Mount once near the app root.
 */
export function MouseProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Set<MouseHandler>());
  const { stdin, setRawMode, isRawModeSupported } = useStdin();

  const subscribe = useCallback((handler: MouseHandler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!isRawModeSupported) return;

    enableMouseTracking();
    setRawMode(true);

    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const events = parseSgrMouseEvents(text);
      if (events.length === 0) return;
      for (const event of events) {
        for (const handler of handlers.current) {
          handler(event);
        }
      }
    };

    // prependListener so we see events even if others pause later.
    stdin.prependListener("data", onData);

    const cleanupTerminal = () => forceDisableMouseTracking();
    process.on("exit", cleanupTerminal);

    return () => {
      stdin.off("data", onData);
      process.off("exit", cleanupTerminal);
      disableMouseTracking();
    };
  }, [stdin, setRawMode, isRawModeSupported]);

  const value = useMemo(() => ({ subscribe }), [subscribe]);

  return (
    <MouseContext.Provider value={value}>{children}</MouseContext.Provider>
  );
}

/** Subscribe to terminal mouse events (wheel, click, move). */
export function useMouse(handler: MouseHandler, enabled = true): void {
  const ctx = useContext(MouseContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx || !enabled) return;
    return ctx.subscribe((event) => handlerRef.current(event));
  }, [ctx, enabled]);
}
