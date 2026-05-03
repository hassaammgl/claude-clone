import React from "react";
import { TextAttributes } from "@opentui/core";

interface InputAreaProps {
  onSubmit: (value: string) => void;
  statusText?: string;
  isBusy?: boolean;
}

export const InputArea = ({ onSubmit, statusText = "Ready to fly", isBusy = false }: InputAreaProps) => {
  return (
    <box flexDirection="column" marginTop={1} width="100%">
      <box paddingLeft={1} marginBottom={0}>
        <text fg="#fb7185" attributes={TextAttributes.ITALIC} wrap="truncate">
          {isBusy ? "Parrot is scanning the jungle..." : statusText}
        </text>
      </box>
      <box
        borderStyle="single"
        borderColor={isBusy ? "gray" : "#2eff58"}
        paddingLeft={1}
        paddingRight={1}
        width="100%"
        flexDirection="row"
      >
        <text fg={isBusy ? "gray" : "#2eff58"} attributes={TextAttributes.BOLD}>
          {"🦜 > "}
        </text>
        <input
          flexGrow={1}
          focused={!isBusy}
          onSubmit={onSubmit}
        />
      </box>
    </box>
  );
};
