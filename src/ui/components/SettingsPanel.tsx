import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme";
import { loadSettings, saveSettings } from "../../config/settings";
import type { Settings } from "../../config/settings";
import { getToolDefinitions } from "../../tools/index";
import { SettingsBody } from "./SettingsBody";
import type { SettingsScreen } from "./SettingsBody";

export type { SettingsScreen } from "./SettingsBody";

interface SettingsPanelProps {
  initialScreen?: SettingsScreen;
  onClose: () => void;
  onReloadAgent: () => void;
  onApproveTools: (tools: string[]) => void;
  alwaysAllowed: string[];
}

const PROVIDERS = ["ollama", "claude", "gemini", "openai"] as const;
const TOOL_MODES = ["auto", "prompt", "native"] as const;

function savePatch(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
}

export const SettingsPanel = ({
  initialScreen = "menu",
  onClose,
  onReloadAgent,
  onApproveTools,
  alwaysAllowed,
}: SettingsPanelProps) => {
  const [screen, setScreen] = useState<SettingsScreen>(initialScreen);
  const [settings, setSettings] = useState(loadSettings);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState("");

  const showFlash = (text: string) => {
    setFlash(text);
    setDraft("");
  };

  const handleMenu = (value: string) => {
    const choice = value.trim();
    if (choice === "0" || choice.toLowerCase() === "q") {
      onClose();
      return;
    }
    const map: Record<string, SettingsScreen> = {
      "1": "provider",
      "2": "model",
      "3": "toolMode",
      "4": "waifu",
      "5": "setup",
    };
    const next = map[choice];
    if (!next) {
      showFlash("Pick 1–5, or 0 to close");
      return;
    }
    setScreen(next);
    setDraft("");
  };

  const handleProvider = (value: string) => {
    const provider = PROVIDERS[Number(value.trim()) - 1];
    if (!provider) {
      showFlash("Invalid provider");
      return;
    }
    setSettings(savePatch({ activeProvider: provider }));
    onReloadAgent();
    showFlash(`Provider → ${provider}`);
    setScreen("menu");
  };

  const handleToolMode = (value: string) => {
    const mode = TOOL_MODES[Number(value.trim()) - 1];
    if (!mode) {
      showFlash("Invalid mode");
      return;
    }
    setSettings(savePatch({ ollamaToolMode: mode }));
    onReloadAgent();
    showFlash(`Tool mode → ${mode}`);
    setScreen("menu");
  };

  const handleModel = (value: string) => {
    const model = value.trim();
    if (!model) {
      showFlash("Model name required");
      return;
    }
    setSettings(savePatch({ ollamaModel: model, activeProvider: "ollama" }));
    onReloadAgent();
    showFlash(`Model → ${model}`);
    setScreen("menu");
  };

  const handleWaifu = (value: string) => {
    const on = value.trim() === "1";
    setSettings(savePatch({ waifuMode: on }));
    showFlash(`Waifu mode → ${on ? "ON" : "OFF"}`);
    setScreen("menu");
  };

  const handleSetup = (value: string) => {
    const choice = value.trim().toLowerCase();
    const pending = getToolDefinitions()
      .map((t) => t.name)
      .filter((name) => !alwaysAllowed.includes(name));
    if (choice === "0") {
      setScreen("menu");
      setDraft("");
      return;
    }
    if (choice === "a") {
      onApproveTools(pending);
      showFlash(`Approved ${pending.length} tools`);
      setScreen("menu");
      return;
    }
    const valid = choice
      .split(",")
      .map((s) => s.trim())
      .filter((n) => pending.includes(n));
    if (valid.length === 0) {
      showFlash("No matching tool names");
      return;
    }
    onApproveTools(valid);
    showFlash(`Approved: ${valid.join(", ")}`);
    setScreen("menu");
  };

  const onSubmit = (value: string) => {
    if (screen === "menu") handleMenu(value);
    else if (screen === "provider") handleProvider(value);
    else if (screen === "toolMode") handleToolMode(value);
    else if (screen === "model") handleModel(value);
    else if (screen === "waifu") handleWaifu(value);
    else handleSetup(value);
  };

  const pendingTools = getToolDefinitions()
    .map((t) => t.name)
    .filter((name) => !alwaysAllowed.includes(name));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      borderBackgroundColor={theme.bgPanel}
      paddingX={1}
      width="100%"
      marginTop={1}
      backgroundColor={theme.bgPanel}
    >
      <Text color={theme.brand} bold backgroundColor={theme.bgPanel}>
        Settings
      </Text>
      {flash ? (
        <Text color={theme.success} backgroundColor={theme.bgPanel}>
          {flash}
        </Text>
      ) : null}
      <SettingsBody
        screen={screen}
        settings={settings}
        pendingTools={pendingTools}
      />
      <Box marginTop={1} backgroundColor={theme.bgPanel}>
        <Text color={theme.prompt} backgroundColor={theme.bgPanel}>
          ❯{" "}
        </Text>
        <TextInput value={draft} onChange={setDraft} onSubmit={onSubmit} />
      </Box>
    </Box>
  );
};
