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
  placeholder = "Message Noni-chan…",
  disabled = false,
}: InputAreaProps) => {
  const [query, setQuery] = useState("");

  const handleChange = (value: string) => {
    // Mouse SGR sequences can leak into TextInput — drop them.
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
      flexDirection="row"
      width="100%"
      borderStyle="round"
      borderColor={disabled ? theme.dim : theme.border}
      borderBackgroundColor={theme.bgInput}
      paddingX={1}
      marginTop={1}
      backgroundColor={theme.bgInput}
    >
      <Text
        color={disabled ? theme.dim : theme.prompt}
        bold
        backgroundColor={theme.bgInput}
      >
        ❯{" "}
      </Text>
      <TextInput
        value={query}
        onChange={handleChange}
        onSubmit={handleSubmit}
        placeholder={disabled ? "Working…" : placeholder}
        focus={!disabled}
      />
    </Box>
  );
};
