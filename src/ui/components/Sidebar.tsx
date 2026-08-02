import { Box, Text } from "ink";
import { theme, ESTIMATED_CONTEXT_WINDOW } from "../theme";

interface SidebarProps {
  tokens: { input: number; output: number };
  modelLabel: string;
  cwd: string;
  branch: string;
  version: string;
  toolMode: string;
  provider: string;
  width: number;
  height: number;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function clip(text: string, width: number): string {
  const max = Math.max(4, width - 2);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export const Sidebar = ({
  tokens,
  modelLabel,
  cwd,
  branch,
  version,
  toolMode,
  provider,
  width,
  height,
}: SidebarProps) => {
  const total = tokens.input + tokens.output;
  const pct = Math.min(
    100,
    Math.round((total / ESTIMATED_CONTEXT_WINDOW) * 100),
  );
  const shortCwd = cwd.replace(process.env.HOME || "", "~");
  const bg = theme.bgSidebar;
  const inner = Math.max(8, width - 2);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      paddingX={1}
      overflow="hidden"
      borderStyle="single"
      borderColor={theme.border}
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      backgroundColor={bg}
    >
      <Text color={theme.brand} bold backgroundColor={bg} wrap="truncate">
        Session
      </Text>
      <Text color={theme.cream} backgroundColor={bg} wrap="truncate">
        {clip(modelLabel, inner)}
      </Text>
      <Text color={theme.dim} backgroundColor={bg} wrap="truncate">
        {clip(`${provider} · ${toolMode}`, inner)}
      </Text>

      <Box marginTop={1} flexDirection="column" backgroundColor={bg}>
        <Text color={theme.brand} bold backgroundColor={bg} wrap="truncate">
          Context
        </Text>
        <Text color={theme.cream} backgroundColor={bg} wrap="truncate">
          {clip(`${total.toLocaleString()} tokens`, inner)}
        </Text>
        <Text color={theme.yellow} backgroundColor={bg} wrap="truncate">
          {pct}% used
        </Text>
        <Text color={theme.muted} backgroundColor={bg} wrap="truncate">
          {clip(
            `↑${formatTokens(tokens.input)} ↓${formatTokens(tokens.output)}`,
            inner,
          )}
        </Text>
        <Text color={theme.dim} backgroundColor={bg} wrap="truncate">
          $0.00
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column" backgroundColor={bg}>
        <Text color={theme.brand} bold backgroundColor={bg} wrap="truncate">
          LSP
        </Text>
        <Text color={theme.dim} backgroundColor={bg} wrap="truncate">
          disabled
        </Text>
      </Box>

      <Box flexGrow={1} backgroundColor={bg} />

      <Text color={theme.muted} backgroundColor={bg} wrap="truncate">
        {clip(`${shortCwd}:${branch}`, inner)}
      </Text>
      <Text color={theme.dim} backgroundColor={bg} wrap="truncate">
        {clip(`● Noni ${version}`, inner)}
      </Text>
    </Box>
  );
};
