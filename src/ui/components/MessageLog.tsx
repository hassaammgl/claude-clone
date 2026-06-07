import React from "react";
import { Box, Text } from "ink";
import { ScrollView } from "ink-scroll-view";
import { MessageItem } from "./MessageItem";

interface MessageLogProps {
  messages: any[];
  streamingContent?: string;
}

export const MessageLog = ({ messages, streamingContent }: MessageLogProps) => {
  const items: React.ReactNode[] = [];

  messages.forEach((msg, i) => {
    if (Array.isArray(msg.content)) {
      msg.content.forEach((block: any, blockIdx: number) => {
        if (block.type === "tool_use") {
          items.push(
            <MessageItem
              key={`msg-${i}-block-${blockIdx}`}
              type="action"
              label="Tool Call"
              content={`**${block.name}**\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``}
            />
          );
        } else if (block.type === "tool_result") {
          items.push(
            <MessageItem
              key={`msg-${i}-block-${blockIdx}`}
              type={block.is_error ? "error" : "thought"}
              label="Tool Result"
              content={
                typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content, null, 2)
              }
            />
          );
        } else if (block.type === "text") {
          items.push(
            <MessageItem
              key={`msg-${i}-block-${blockIdx}`}
              type="assistant"
              content={String(block.text)}
            />
          );
        }
      });
    } else {
      const type =
        msg.role === "user"
          ? "user"
          : msg.role === "error"
            ? "error"
            : "assistant";
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content, null, 2);

      items.push(<MessageItem key={`msg-${i}`} type={type} content={content} />);
    }
  });

  if (streamingContent) {
    items.push(
      <MessageItem
        key="streaming"
        type="assistant"
        content={streamingContent}
        isStreaming={true}
      />
    );
  }

  return (
    <ScrollView flexGrow={1}>
      {items.map((item, idx) => (
        <Box key={idx} flexDirection="column">
          {item}
          {idx < items.length - 1 && (
            <Box marginBottom={1} paddingLeft={1}>
              <Text color="gray" dim>
                ────────────────────────────────────────────────────────────────────────────────
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </ScrollView>
  );
};
