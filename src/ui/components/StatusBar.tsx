import { Box, Text } from "ink";
import { theme, ESTIMATED_CONTEXT_WINDOW } from "../theme";
import { AudioWave, LiveDot } from "./Motion";

interface StatusBarProps {
  cwd: string;
  tokens?: { input: number; output: number };
  busy?: boolean;
}

export const StatusBar = ({ cwd, tokens, busy = false }: StatusBarProps) => {
  const total = (tokens?.input || 0) + (tokens?.output || 0);
  const pct = Math.min(
    100,
    Math.round((total / ESTIMATED_CONTEXT_WINDOW) * 100),
  );
  const tokenLabel =
    total >= 1000 ? `${(total / 1000).toFixed(1)}K` : String(total);

  return (
    <Box
      flexDirection="row"
      width="100%"
      justifyContent="space-between"
      backgroundColor={theme.bgPanel}
      paddingX={1}
    >
      <Box flexDirection="row" backgroundColor={theme.bgPanel}>
        <LiveDot active={!busy} backgroundColor={theme.bgPanel} />
        <Text color={theme.dim} wrap="truncate" backgroundColor={theme.bgPanel}>
          {" "}
          {cwd}
        </Text>
      </Box>
      <Box flexDirection="row" backgroundColor={theme.bgPanel}>
        {busy ? <AudioWave active backgroundColor={theme.bgPanel} /> : null}
        {busy ? (
          <Text color={theme.dim} backgroundColor={theme.bgPanel}>
            {" "}
          </Text>
        ) : null}
        <Text color={theme.yellow} backgroundColor={theme.bgPanel}>
          {tokenLabel} ({pct}%)
        </Text>
        <Text color={theme.dim} backgroundColor={theme.bgPanel}>
          {"  "}tab · ↑↓ · enter
        </Text>
      </Box>
    </Box>
  );
};
