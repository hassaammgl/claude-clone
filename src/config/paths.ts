import os from "os";
import path from "path";

/**
 * Cross-platform config directory for noni-chan.
 *
 * - Windows: %APPDATA%\noni-chan
 * - macOS:   ~/Library/Application Support/noni-chan
 * - Linux:   $XDG_CONFIG_HOME/noni-chan or ~/.config/noni-chan
 *
 * Layout:
 *   settings.json
 *   sessions/<cwd-hash>.json   ← persistent chat memory per project folder
 */
export function getConfigDir(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    return path.join(appData || os.homedir(), "noni-chan");
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "noni-chan",
    );
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  return path.join(xdg || path.join(os.homedir(), ".config"), "noni-chan");
}

