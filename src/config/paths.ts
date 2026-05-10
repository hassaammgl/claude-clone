import os from "os";
import path from "path";

/**
 * Cross-platform config directory for hero-cli.
 *
 * - Windows: %APPDATA%\hero-cli
 * - macOS:   ~/Library/Application Support/hero-cli
 * - Linux:   $XDG_CONFIG_HOME/hero-cli or ~/.config/hero-cli
 */
export function getConfigDir(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    return path.join(appData || os.homedir(), "hero-cli");
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "hero-cli",
    );
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  return path.join(xdg || path.join(os.homedir(), ".config"), "hero-cli");
}

