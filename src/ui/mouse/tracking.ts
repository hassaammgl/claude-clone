const ENABLE = "\x1b[?1000h\x1b[?1006h";
const DISABLE = "\x1b[?1000l\x1b[?1006l";

let enableCount = 0;

/** Enable X10 click/wheel reporting + SGR encoding (refcount). */
export function enableMouseTracking(): void {
  enableCount += 1;
  if (enableCount === 1 && process.stdout.isTTY) {
    process.stdout.write(ENABLE);
  }
}

/** Disable mouse reporting when last consumer unmounts. */
export function disableMouseTracking(): void {
  enableCount = Math.max(0, enableCount - 1);
  if (enableCount === 0 && process.stdout.isTTY) {
    process.stdout.write(DISABLE);
  }
}

export function forceDisableMouseTracking(): void {
  enableCount = 0;
  if (process.stdout.isTTY) {
    process.stdout.write(DISABLE);
  }
}
