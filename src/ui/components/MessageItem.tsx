import { Box, Text } from "ink";
import Markdown from "ink-markdown-es";
import { theme } from "../theme";
import { BlinkCaret } from "./Motion";

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

function roleMeta(type: MessageType, label?: string): {
  title: string;
  color: string;
  bg: string;
  mark: string;
} {
  switch (type) {
    case "user":
      return {
        title: "you",
        color: theme.brand,
        bg: theme.bgUser,
        mark: "❯",
      };
    case "action":
      return {
        title: label || "tool",
        color: theme.accent,
        bg: theme.bgTool,
        mark: "→",
      };
    case "thought":
      return {
        title: label || "result",
        color: theme.yellow,
        bg: theme.bgTool,
        mark: "·",
      };
    case "error":
      return {
        title: "error",
        color: theme.error,
        bg: theme.bgMessage,
        mark: "✕",
      };
    default:
      return {
        title: "noni",
        color: theme.green,
        bg: theme.bgMessage,
        mark: "◆",
      };
  }
}

function clipContent(content: string, type: MessageType): string {
  if (type !== "action" && type !== "thought") return content;
  if (content.length <= 1200) return content;
  return `${content.slice(0, 1200)}\n…`;
}

export const MessageItem = ({
  type,
  content,
  label,
  isStreaming,
}: MessageItemProps) => {
  const meta = roleMeta(type, label);
  const isUser = type === "user";
  const body = clipContent(content, type);

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      width="100%"
      backgroundColor={meta.bg}
      paddingX={0}
    >
      <Box flexDirection="row" backgroundColor={meta.bg}>
        <Text color={meta.color} bold backgroundColor={meta.bg}>
          {meta.mark}
        </Text>
        <Text color={meta.color} bold backgroundColor={meta.bg}>
          {" "}
          {meta.title}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        marginLeft={2}
        backgroundColor={meta.bg}
      >
        {isUser ? (
          <Text color={theme.cream} backgroundColor={meta.bg}>
            {body}
          </Text>
        ) : (
          <Box flexGrow={1} flexDirection="column" backgroundColor={meta.bg}>
            <Markdown>{body}</Markdown>
            {isStreaming ? (
              <BlinkCaret active backgroundColor={meta.bg} />
            ) : null}
          </Box>
        )}
      </Box>
    </Box>
  );
};
