import React from "react";
import { TextAttributes } from "@opentui/core";
import { Logo } from "./Logo";

interface HeaderProps {
  version?: string;
  userName?: string;
  modelInfo?: string;
  currentPath?: string;
}

export const Header = ({
  version = "v2.0.55",
  userName = "User",
  modelInfo = "Tropical Parrot · v3.5",
  currentPath = process.cwd(),
}: HeaderProps) => {
  return (
    <box
      borderStyle="single"
      borderColor="#2eff58"
      padding={1}
      flexDirection="column"
      marginBottom={1}
      width="100%"
    >
      {/* Header Info */}
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <box flexDirection="column">
          <text fg="#2eff58" attributes={TextAttributes.BOLD}>🦜 Parrot Code</text>
          <text fg="#fb7185" attributes={TextAttributes.BOLD}>{modelInfo}</text>
        </box>
        <text fg="gray">{version}</text>
      </box>

      {/* Centered Logo with flexible space */}
      <box 
        flexDirection="column" 
        alignItems="center" 
        marginTop={1} 
        marginBottom={1}
        width="100%"
      >
        <Logo />
      </box>

      {/* User Info */}
      <box flexDirection="column" alignItems="center" width="100%" marginBottom={1}>
        <text fg="#facc15" attributes={TextAttributes.BOLD}>
          Welcome back, {userName}!
        </text>
        <text fg="gray" wrap="truncate">
          {currentPath}
        </text>
      </box>

      {/* Bottom Status (No border to avoid dashes) */}
      <box 
        flexDirection="row"
        justifyContent="space-between"
        width="100%"
        paddingLeft={2}
        paddingRight={2}
      >
        <box flexDirection="row">
          <text fg="#38bdf8" attributes={TextAttributes.BOLD}>TIPS </text>
          <text fg="gray" wrap="truncate">Fly through your code...</text>
        </box>
        <box flexDirection="row">
          <text fg="#fb7185" attributes={TextAttributes.BOLD}>NEST </text>
          <text fg="gray" wrap="truncate">Active & Scanning</text>
        </box>
      </box>
    </box>
  );
};
