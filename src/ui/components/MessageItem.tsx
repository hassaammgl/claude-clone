import { Box, Text } from "ink";
import Markdown from "ink-markdown-es";

export type MessageType =
  | "user"
  | "thought"
  | "action"
  | "result"
  | "error"
  | "assistant";

interface MessageItemProps {
  type: MessageType;
  content: string;
  label?: string;
  isStreaming?: boolean;
}

export const MessageItem = ({
  type,
  content,
  label,
  // isStreaming,
}: MessageItemProps) => {
  const getIcon = () => {
    switch (type) {
      case "user":
        return "🦜 ";
      case "thought":
        return "● ";
      case "action":
        return "⚡ ";
      case "error":
        return "💀 ";
      default:
        return "";
    }
  };

  const getIconColor = () => {
    switch (type) {
      case "user":
        return "blue";
      case "thought":
        return "red";
      case "action":
        return "yellow";
      case "error":
        return "red";
      default:
        return "gray";
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      <Box flexDirection="row" width="100%">
        <Text color={getIconColor()} bold>
          {getIcon()}
        </Text>
        {label && (
          <Text color={getIconColor()} bold wrap="truncate">
            {label}:
          </Text>
        )}
        <Box flexGrow={1}>
          <Markdown>{content}</Markdown>
        </Box>
      </Box>
    </Box>
  );
};
