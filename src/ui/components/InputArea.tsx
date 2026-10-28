import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme";
import { looksLikeMouseLeak } from "../mouse/parse";

interface InputAreaProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const InputArea = ({
  onSubmit,
  placeholder = "Message Noni…",
  disabled = false,
}: InputAreaProps) => {
  const [query, setQuery] = useState("");

  const handleChange = (value: string) => {
    if (looksLikeMouseLeak(value)) return;
    setQuery(value);
  };

  const handleSubmit = (value: string) => {
    if (disabled || !value.trim()) return;
    if (looksLikeMouseLeak(value)) return;
    setQuery("");
    onSubmit(value);
  };

  return (
    <Box
      flexDirection="column"
      width="100%"
      marginTop={0}
      backgroundColor={theme.bg}
    >
      <Text color={theme.borderSoft} backgroundColor={theme.bg}>
        {"─".repeat(48)}
      </Text>
      <Box
        flexDirection="row"
        width="100%"
        paddingX={1}
        backgroundColor={theme.bgInput}
      >
        <Text
          color={disabled ? theme.dim : theme.prompt}
          bold
          backgroundColor={theme.bgInput}
        >
          ❯{" "}
        </Text>
        <Box flexGrow={1} backgroundColor={theme.bgInput}>
          <TextInput
            value={query}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder={disabled ? "Working…" : placeholder}
            focus={!disabled}
          />
        </Box>
      </Box>
    </Box>
  );
};
