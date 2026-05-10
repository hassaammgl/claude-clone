import { Box, Text } from "ink";
import { Logo } from "./Logo";

interface HeaderProps {
  version?: string;
  userName?: string;
  modelInfo?: string;
  currentPath?: string;
}

export const Header = ({
  version = "v2.0.55",
  userName = "User",
  modelInfo = "Tropical Parrot · v3.5",
  currentPath = process.cwd(),
}: HeaderProps) => {
  return (
    <Box
      borderStyle="single"
      borderColor="green"
      padding={1}
      flexDirection="column"
      marginBottom={1}
      width="100%"
    >
      {/* Header Info */}
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Box flexDirection="column">
          <Text color="green" bold>
            🦜 Parrot Code
          </Text>
          <Text color="red" bold>
            {modelInfo}
          </Text>
        </Box>
        <Text color="gray">{version}</Text>
      </Box>

      {/* Centered Logo with flexible space */}
      <Box
        flexDirection="column"
        alignItems="center"
        marginTop={1}
        marginBottom={1}
        width="100%"
      >
        <Logo />
      </Box>

      {/* User Info */}
      <Box
        flexDirection="column"
        alignItems="center"
        width="100%"
        marginBottom={1}
      >
        <Text color="yellow" bold>
          Welcome back, {userName}!
        </Text>
        <Text color="gray" wrap="truncate">
          {currentPath}
        </Text>
      </Box>

      {/* Bottom Status (No border to avoid dashes) */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        width="100%"
        paddingLeft={2}
        paddingRight={2}
      >
        <Box flexDirection="row">
          <Text color="blue" bold>
            TIPS{" "}
          </Text>
          <Text color="gray" wrap="truncate">
            Fly through your code...
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color="red" bold>
            NEST{" "}
          </Text>
          <Text color="gray" wrap="truncate">
            Active & Scanning
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
