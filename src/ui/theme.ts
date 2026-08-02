/** High-contrast yellow/green — opaque enough for transparent terminals. */
export const theme = {
  bg: "#050807",
  bgPanel: "#0C1210",
  bgInput: "#101814",
  bgHeader: "#0A100E",
  bgSidebar: "#0A100E",
  brand: "#D4FF4F",
  accent: "#7CFF9A",
  yellow: "#FFE566",
  green: "#5CFF8A",
  cream: "#F2FFE8",
  muted: "#8FA898",
  border: "#1E3328",
  user: "#D4FF4F",
  assistant: "#E4FFD8",
  tool: "#7CFF9A",
  error: "#FF6B6B",
  success: "#5CFF8A",
  dim: "#5C7366",
  prompt: "#D4FF4F",
  busy: "#FFE566",
  purple: "#C4B0FF",
  dir: "#7CFF9A",
  file: "#B8C9B8",
} as const;

export const ESTIMATED_CONTEXT_WINDOW = 128_000;

export type ThemeColor = (typeof theme)[keyof typeof theme];
