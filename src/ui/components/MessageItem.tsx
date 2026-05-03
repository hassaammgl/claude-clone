import React from "react";
import { TextAttributes, SyntaxStyle, RGBA } from "@opentui/core";

const syntaxStyle = SyntaxStyle.fromStyles({
  "markup.heading": { fg: RGBA.fromHex("#38bdf8"), bold: true },
  "markup.list": { fg: RGBA.fromHex("#facc15") },
  "markup.raw": { fg: RGBA.fromHex("#2eff58") },
  "markup.bold": { bold: true },
  "markup.italic": { italic: true },
  default: { fg: RGBA.fromHex("#E6EDF3") },
});

export type MessageType = "user" | "thought" | "action" | "result" | "error" | "assistant";

interface MessageItemProps {
  type: MessageType;
  content: string;
  label?: string;
  isStreaming?: boolean;
}

export const MessageItem = ({ type, content, label, isStreaming }: MessageItemProps) => {
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
        return "#38bdf8";
      case "thought":
        return "#fb7185";
      case "action":
        return "#facc15";
      case "error":
        return "#ef4444";
      default:
        return "gray";
    }
  };

  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      <box flexDirection="row" width="100%">
        <text fg={getIconColor()} attributes={TextAttributes.BOLD}>
          {getIcon()}
        </text>
        {label && (
          <text fg={getIconColor()} attributes={TextAttributes.BOLD} wrap="truncate">
            {label}: 
          </text>
        )}
        <box flexGrow={1} width="100%">
           <markdown 
              content={content} 
              syntaxStyle={syntaxStyle} 
              streaming={isStreaming}
           />
        </box>
      </box>
    </box>
  );
};
