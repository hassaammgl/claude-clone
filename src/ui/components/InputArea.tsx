import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface InputAreaProps {
  onSubmit: (value: string) => void;
  statusText?: string;
  isBusy?: boolean;
}

export const InputArea = ({
  onSubmit,
  statusText = "Ready to fly",
  isBusy = false,
}: InputAreaProps) => {
  const [query, setQuery] = useState("");

  const handleSubmit = (value: string) => {
    setQuery("");
    onSubmit(value);
  };

  return (
    <Box flexDirection="column" marginTop={1} width="100%">
      <Box paddingLeft={1} marginBottom={0}>
        <Text color="red" italic wrap="truncate">
          {isBusy ? "Parrot is scanning the jungle..." : statusText}
        </Text>
      </Box>
      <Box
        borderStyle="single"
        borderColor={isBusy ? "gray" : "green"}
        paddingLeft={1}
        paddingRight={1}
        width="100%"
        flexDirection="row"
      >
        <Text color={isBusy ? "gray" : "green"} bold>
          {"🦜 > "}
        </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          placeholder="Type your command..."
        />
      </Box>
    </Box>
  );
};
