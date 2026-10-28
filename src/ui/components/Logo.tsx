import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { pickFrame, useTick } from "../hooks/useTick";

/** Compact brand mark — fits empty chat without dominating. */
const logo = `
⠀⢀⣀⣤⣤⣤⣀⡀
⢠⣿⣿⣿⣿⣿⣿⣿⣦
⣿⣿⣿⣿⣿⣿⣿⣿⣿
⠘⣿⣿⣿⣿⣿⣿⣿⠟
⠀⠈⠛⠿⣿⠿⠛⠁`;

const PALETTE = [
  theme.brand,
  theme.accent,
  theme.green,
  theme.accent,
] as const;

export const Logo = () => {
  const frame = useTick(380, true);

  return (
    <Box flexDirection="column" alignItems="center" backgroundColor={theme.bg}>
      {logo
        .trim()
        .split("\n")
        .map((line, i) => (
          <Text
            key={i}
            color={pickFrame(PALETTE, frame + i)}
            backgroundColor={theme.bg}
          >
            {line}
          </Text>
        ))}
    </Box>
  );
};
