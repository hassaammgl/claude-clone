import { Box, Text } from "ink";
import { theme } from "../theme";
import type { Settings } from "../../config/settings";

export type SettingsScreen =
  | "menu"
  | "provider"
  | "toolMode"
  | "model"
  | "waifu"
  | "setup";

const PROVIDERS = ["ollama", "claude", "gemini", "openai"] as const;
const bg = theme.bgPanel;

interface SettingsBodyProps {
  screen: SettingsScreen;
  settings: Settings;
  pendingTools: string[];
}

function Line({
  children,
  color = theme.cream,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Text color={color} backgroundColor={bg}>
      {children}
    </Text>
  );
}

export function SettingsBody({
  screen,
  settings,
  pendingTools,
}: SettingsBodyProps) {
  if (screen === "menu") {
    return (
      <Box flexDirection="column" backgroundColor={bg}>
        <Line>
          1) Provider{" "}
          <Text color={theme.muted} backgroundColor={bg}>
            [{settings.activeProvider || "auto"}]
          </Text>
        </Line>
        <Line>
          2) Ollama model{" "}
          <Text color={theme.muted} backgroundColor={bg}>
            [{settings.ollamaModel || "—"}]
          </Text>
        </Line>
        <Line>
          3) Tool mode{" "}
          <Text color={theme.muted} backgroundColor={bg}>
            [{settings.ollamaToolMode || "auto"}]
          </Text>
        </Line>
        <Line>
          4) Waifu{" "}
          <Text color={theme.muted} backgroundColor={bg}>
            [{settings.waifuMode ? "ON" : "OFF"}]
          </Text>
        </Line>
        <Line>
          5) Setup tools{" "}
          <Text color={theme.muted} backgroundColor={bg}>
            [{pendingTools.length} pending]
          </Text>
        </Line>
        <Line color={theme.dim}>0) Close</Line>
      </Box>
    );
  }
  if (screen === "provider") {
    return (
      <Box flexDirection="column" backgroundColor={bg}>
        {PROVIDERS.map((p, i) => (
          <Line key={p}>
            {i + 1}) {p}
          </Line>
        ))}
      </Box>
    );
  }
  if (screen === "toolMode") {
    return (
      <Box flexDirection="column" backgroundColor={bg}>
        <Line>1) auto — native + text fallback</Line>
        <Line>2) prompt — best for small models</Line>
        <Line>3) native — API tools only</Line>
      </Box>
    );
  }
  if (screen === "model") {
    return <Line color={theme.muted}>Type model (e.g. llama3.2:3b)</Line>;
  }
  if (screen === "waifu") {
    return (
      <Box flexDirection="column" backgroundColor={bg}>
        <Line>1) ON</Line>
        <Line>2) OFF</Line>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" backgroundColor={bg}>
      <Text color={theme.muted} wrap="truncate" backgroundColor={bg}>
        Pending: {pendingTools.slice(0, 12).join(", ") || "none"}
        {pendingTools.length > 12 ? "…" : ""}
      </Text>
      <Line>a) Approve all · or tool names · 0 back</Line>
    </Box>
  );
}
