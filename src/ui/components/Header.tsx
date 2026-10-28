import { Box, Text } from "ink";
import { theme } from "../theme";
import { Spinner } from "./Motion";

interface HeaderProps {
  modelLabel: string;
  busy?: boolean;
}

export const Header = ({ modelLabel, busy = false }: HeaderProps) => {
  return (
    <Box
      flexDirection="column"
      width="100%"
      backgroundColor={theme.bgHeader}
      marginBottom={0}
    >
      <Box
        flexDirection="row"
        width="100%"
        justifyContent="space-between"
        backgroundColor={theme.bgHeader}
        paddingX={0}
      >
        <Box flexDirection="row" backgroundColor={theme.bgHeader}>
          <Text color={theme.brand} bold backgroundColor={theme.bgHeader}>
            Noni
          </Text>
          <Text color={theme.dim} backgroundColor={theme.bgHeader}>
            -chan
          </Text>
          <Text color={theme.dim} backgroundColor={theme.bgHeader}>
            {"  "}
          </Text>
          {busy ? (
            <Box flexDirection="row" backgroundColor={theme.bgHeader}>
              <Spinner
                active
                color={theme.busy}
                backgroundColor={theme.bgHeader}
              />
              <Text color={theme.busy} backgroundColor={theme.bgHeader}>
                {" thinking"}
              </Text>
            </Box>
          ) : (
            <Text color={theme.muted} backgroundColor={theme.bgHeader}>
              ready
            </Text>
          )}
        </Box>
        <Text
          color={theme.dim}
          backgroundColor={theme.bgHeader}
          wrap="truncate"
        >
          {modelLabel}
        </Text>
      </Box>
      <Text color={theme.borderSoft} backgroundColor={theme.bgHeader}>
        {"─".repeat(48)}
      </Text>
    </Box>
  );
};
