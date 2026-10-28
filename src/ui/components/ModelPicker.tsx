import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";
import {
  formatModelSize,
  type OllamaModelInfo,
} from "../../ollama/models";

interface ModelPickerProps {
  models: OllamaModelInfo[];
  current?: string;
  title?: string;
  onSelect: (model: string) => void;
  onSkip?: () => void;
}

export const ModelPicker = ({
  models,
  current,
  title = "Select model",
  onSelect,
  onSkip,
}: ModelPickerProps) => {
  const initial = Math.max(
    0,
    models.findIndex((m) => m.name === current),
  );
  const [cursor, setCursor] = useState(initial < 0 ? 0 : initial);

  useEffect(() => {
    const idx = models.findIndex((m) => m.name === current);
    if (idx >= 0) setCursor(idx);
  }, [current, models]);

  useInput((_input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(models.length - 1, c + 1));
      return;
    }
    if (key.return) {
      const model = models[cursor];
      if (model) onSelect(model.name);
      return;
    }
    if (key.escape && onSkip) {
      onSkip();
    }
  });

  const window = 10;
  const start = Math.max(0, Math.min(cursor - 4, models.length - window));
  const visible = models.slice(start, start + window);

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="round"
      borderColor={theme.border}
      borderBackgroundColor={theme.bgElevated}
      paddingX={1}
      marginTop={1}
      backgroundColor={theme.bgElevated}
    >
      <Text color={theme.brand} bold backgroundColor={theme.bgElevated}>
        {title}
      </Text>
      <Text color={theme.dim} backgroundColor={theme.bgElevated}>
        ↑↓ · enter{onSkip ? " · esc" : ""}
      </Text>
      <Box flexDirection="column" marginTop={1} backgroundColor={theme.bgElevated}>
        {visible.map((model, i) => {
          const index = start + i;
          const selected = index === cursor;
          const active = model.name === current;
          const label = `${model.name}  ${formatModelSize(model.size)}${
            active ? "  ✓" : ""
          }`;
          return (
            <Text
              key={model.name}
              color={selected ? theme.bg : theme.cream}
              backgroundColor={selected ? theme.brand : theme.bgElevated}
              bold={selected}
              wrap="truncate"
            >
              {selected ? "❯ " : "  "}
              {label}
            </Text>
          );
        })}
      </Box>
      {models.length > window ? (
        <Text color={theme.dim} backgroundColor={theme.bgElevated}>
          {cursor + 1}/{models.length}
        </Text>
      ) : null}
    </Box>
  );
};
