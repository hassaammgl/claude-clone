import { useEffect, useState } from "react";

/** Advances a frame counter on an interval — drives terminal micro-animations. */
export function useTick(ms = 120, enabled = true): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setFrame((f) => f + 1);
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);

  return frame;
}

export function pickFrame<T>(frames: readonly T[], frame: number): T {
  return frames[frame % frames.length] as T;
}
