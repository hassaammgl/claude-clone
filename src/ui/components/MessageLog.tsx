import { ScrollView } from "ink-scroll-view";
import { MessageItem } from "./MessageItem";

interface MessageLogProps {
  messages: any[];
  streamingContent?: string;
}

export const MessageLog = ({ messages, streamingContent }: MessageLogProps) => {
  return (
    <ScrollView flexGrow={1}>
      {messages.flatMap((msg, i) => {
        if (Array.isArray(msg.content)) {
          return msg.content
            .map((block: any, blockIdx: number) => {
              if (block.type === "tool_use") {
                return (
                  <MessageItem
                    key={`${i}-${blockIdx}`}
                    type="action"
                    label="Tool Call"
                    content={`**${block.name}**\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``}
                  />
                );
              }
              if (block.type === "tool_result") {
                return (
                  <MessageItem
                    key={`${i}-${blockIdx}`}
                    type={block.is_error ? "error" : "thought"}
                    label="Tool Result"
                    content={
                      typeof block.content === "string"
                        ? block.content
                        : JSON.stringify(block.content, null, 2)
                    }
                  />
                );
              }
              if (block.type === "text") {
                return (
                  <MessageItem
                    key={`${i}-${blockIdx}`}
                    type="assistant"
                    content={String(block.text)}
                  />
                );
              }
              return null;
            })
            .filter(Boolean);
        }

        // Handle simple string content or other roles
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

        return [<MessageItem key={i} type={type} content={content} />];
      })}

      {streamingContent && (
        <MessageItem
          type="assistant"
          content={streamingContent}
          isStreaming={true}
        />
      )}
    </ScrollView>
  );
};
