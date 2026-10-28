/**
 * Noni-chan TUI — matcha ink.
 * Deep forest base; lime only for brand / you / focus.
 */
export const theme = {
  bg: "#07100C",
  bgPanel: "#0F1813",
  bgInput: "#121C16",
  bgHeader: "#0A120E",
  bgSidebar: "#0B1310",
  bgMessage: "#07100C",
  bgUser: "#0E1913",
  bgTool: "#0C1511",
  bgElevated: "#152019",

  brand: "#B8F04A",
  accent: "#5FE3A0",
  yellow: "#DCC86A",
  green: "#4FD48A",
  cream: "#E6F0E2",
  muted: "#7E9586",
  border: "#1C2C24",
  borderFocus: "#B8F04A",
  borderSoft: "#15241C",

  user: "#B8F04A",
  assistant: "#D2E6CC",
  tool: "#5FE3A0",
  error: "#E87878",
  success: "#4FD48A",
  dim: "#4A5F54",
  prompt: "#B8F04A",
  busy: "#DCC86A",
  purple: "#A898D8",
  dir: "#5FE3A0",
  file: "#95AA9A",
} as const;

export const ESTIMATED_CONTEXT_WINDOW = 128_000;

export type ThemeColor = (typeof theme)[keyof typeof theme];
