import { Box, Text } from "ink";
import { theme, ESTIMATED_CONTEXT_WINDOW } from "../theme";
import { Spinner } from "./Motion";

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
    total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total);
  const home = process.env.HOME || "";
  const short =
    home && cwd.startsWith(home)
      ? `~${cwd.slice(home.length)}`
      : cwd.length > 40
        ? `…${cwd.slice(-38)}`
        : cwd;

  return (
    <Box
      flexDirection="row"
      width="100%"
      justifyContent="space-between"
      backgroundColor={theme.bgPanel}
      paddingX={1}
    >
      <Text color={theme.dim} wrap="truncate" backgroundColor={theme.bgPanel}>
        {short}
      </Text>
      <Box flexDirection="row" backgroundColor={theme.bgPanel}>
        {busy ? (
          <>
            <Spinner
              active
              color={theme.accent}
              backgroundColor={theme.bgPanel}
            />
            <Text color={theme.dim} backgroundColor={theme.bgPanel}>
              {" "}
            </Text>
          </>
        ) : null}
        <Text color={theme.muted} backgroundColor={theme.bgPanel}>
          {tokenLabel}
        </Text>
        <Text color={theme.dim} backgroundColor={theme.bgPanel}>
          {" · "}
          {pct}%
        </Text>
      </Box>
    </Box>
  );
};
