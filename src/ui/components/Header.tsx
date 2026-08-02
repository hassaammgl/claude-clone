import { Box, Text } from "ink";
import { theme } from "../theme";
import { LiveDot } from "./Motion";

interface HeaderProps {
  modelLabel: string;
  hint?: string;
  busy?: boolean;
}

export const Header = ({
  modelLabel,
  hint = "Inspect & code with Noni-chan",
  busy = false,
}: HeaderProps) => {
  return (
    <Box
      flexDirection="row"
      width="100%"
      justifyContent="space-between"
      paddingX={1}
      backgroundColor={theme.bgHeader}
    >
      <Box flexDirection="row" backgroundColor={theme.bgHeader}>
        <LiveDot active backgroundColor={theme.bgHeader} />
        <Text color={theme.cream} bold backgroundColor={theme.bgHeader}>
          {" "}
          {hint}
        </Text>
        {busy ? (
          <Text color={theme.busy} backgroundColor={theme.bgHeader}>
            {" "}
            · thinking
          </Text>
        ) : null}
      </Box>
      <Text color={theme.brand} backgroundColor={theme.bgHeader}>
        {modelLabel}
      </Text>
    </Box>
  );
};
