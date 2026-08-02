import { Text } from "ink";
import { theme } from "../theme";
import { pickFrame, useTick } from "../hooks/useTick";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const DOTS = [".  ", ".. ", "...", " ..", "  .", "   "] as const;
const PULSE = ["●", "◉", "○", "◉"] as const;
const WAVE = ["▁", "▂", "▃", "▄", "▅", "▆", "▅", "▄", "▃", "▂"] as const;
const CARET = ["▍", "▌", "▎", " "] as const;

interface AnimProps {
  active?: boolean;
  backgroundColor?: string;
}

export function Spinner({
  active = true,
  backgroundColor = theme.bg,
  color = theme.brand,
}: AnimProps & { color?: string }) {
  const frame = useTick(80, active);
  const glyph = active ? pickFrame(SPINNER, frame) : "✓";
  return (
    <Text color={active ? color : theme.success} backgroundColor={backgroundColor}>
      {glyph}
    </Text>
  );
}

export function ThinkingLabel({
  active = true,
  backgroundColor = theme.bg,
}: AnimProps) {
  const frame = useTick(180, active);
  const dots = pickFrame(DOTS, frame);
  const spin = pickFrame(SPINNER, frame);
  return (
    <Text color={theme.busy} backgroundColor={backgroundColor}>
      {spin} Thought{dots}
    </Text>
  );
}

export function LiveDot({
  active = true,
  backgroundColor = theme.bgHeader,
}: AnimProps) {
  const frame = useTick(400, active);
  const glyph = pickFrame(PULSE, frame);
  return (
    <Text
      color={active ? theme.green : theme.dim}
      backgroundColor={backgroundColor}
    >
      {glyph}
    </Text>
  );
}

export function AudioWave({
  active = true,
  backgroundColor = theme.bgPanel,
}: AnimProps) {
  const frame = useTick(100, active);
  const bars = [0, 1, 2, 3, 4].map((i) =>
    pickFrame(WAVE, frame + i * 2),
  );
  return (
    <Text color={theme.accent} backgroundColor={backgroundColor}>
      {bars.join("")}
    </Text>
  );
}

export function BlinkCaret({
  active = true,
  backgroundColor = theme.bg,
}: AnimProps) {
  const frame = useTick(400, active);
  return (
    <Text color={theme.accent} backgroundColor={backgroundColor}>
      {pickFrame(CARET, frame)}
    </Text>
  );
}

export function PromptBreath({
  backgroundColor = theme.bgInput,
}: AnimProps) {
  // Static prompt — no color animation (distracting in the input field).
  return (
    <Text color={theme.prompt} bold backgroundColor={backgroundColor}>
      ❯{" "}
    </Text>
  );
}
