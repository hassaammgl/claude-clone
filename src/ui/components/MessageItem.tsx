import { Box, Text } from "ink";
import Markdown from "ink-markdown-es";
import { theme } from "../theme";
import { BlinkCaret, Spinner } from "./Motion";

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

function markerFor(type: MessageType): { glyph: string; color: string } {
  switch (type) {
    case "user":
      return { glyph: "❯", color: theme.brand };
    case "action":
      return { glyph: "→", color: theme.accent };
    case "thought":
      return { glyph: "+", color: theme.yellow };
    case "error":
      return { glyph: "✕", color: theme.error };
    default:
      return { glyph: "◆", color: theme.green };
  }
}

export const MessageItem = ({
  type,
  content,
  label,
  isStreaming,
}: MessageItemProps) => {
  const marker = markerFor(type);
  const showSpinner = type === "action";

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      width="100%"
      backgroundColor={theme.bg}
    >
      <Box flexDirection="row" backgroundColor={theme.bg}>
        {showSpinner ? (
          <>
            <Spinner active color={theme.accent} backgroundColor={theme.bg} />
            <Text backgroundColor={theme.bg}> </Text>
          </>
        ) : (
          <Text color={marker.color} bold backgroundColor={theme.bg}>
            {marker.glyph}{" "}
          </Text>
        )}
        {label ? (
          <Text color={marker.color} bold backgroundColor={theme.bg}>
            {label}{" "}
          </Text>
        ) : null}
        {type === "user" ? (
          <Text color={theme.cream} backgroundColor={theme.bg}>
            {content}
          </Text>
        ) : (
          <Box flexGrow={1} flexDirection="column" backgroundColor={theme.bg}>
            <Markdown>{content}</Markdown>
            {isStreaming ? (
              <BlinkCaret active backgroundColor={theme.bg} />
            ) : null}
          </Box>
        )}
      </Box>
    </Box>
  );
};
