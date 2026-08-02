import { Box, Text } from "ink";
import { InputArea } from "./InputArea";
import { theme } from "../theme";
import type { PermissionChoice } from "../../permissions/engine";

const bg = theme.bgPanel;

interface PermissionPromptProps {
  toolName: string;
  input: unknown;
  onDecide: (choice: PermissionChoice) => void;
}

export const PermissionPrompt = ({
  toolName,
  input,
  onDecide,
}: PermissionPromptProps) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      borderBackgroundColor={bg}
      paddingX={1}
      width="100%"
      marginTop={1}
      backgroundColor={bg}
    >
      <Text color={theme.accent} bold backgroundColor={bg}>
        Allow tool · {toolName}?
      </Text>
      <Text color={theme.dim} wrap="truncate" backgroundColor={bg}>
        {JSON.stringify(input)}
      </Text>
      <Text color={theme.muted} backgroundColor={bg}>
        1 once · 2 always · 3 deny
      </Text>
      <InputArea
        placeholder="1 / 2 / 3"
        onSubmit={(val) => {
          if (val === "1") onDecide("allow_once");
          else if (val === "2") onDecide("allow_always");
          else onDecide("deny");
        }}
      />
    </Box>
  );
};

interface QuestionPromptProps {
  question: string;
  options: string[];
  onChoose: (choice: string) => void;
}

export const QuestionPrompt = ({
  question,
  options,
  onChoose,
}: QuestionPromptProps) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      borderBackgroundColor={bg}
      paddingX={1}
      width="100%"
      marginTop={1}
      backgroundColor={bg}
    >
      <Text color={theme.brand} bold backgroundColor={bg}>
        {question}
      </Text>
      {options.map((opt, i) => (
        <Text key={opt} color={theme.cream} backgroundColor={bg}>
          {i + 1}) {opt}
        </Text>
      ))}
      <InputArea
        placeholder="Enter number"
        onSubmit={(val) => {
          const idx = Number(val) - 1;
          onChoose(options[idx] ?? options[0] ?? "");
        }}
      />
    </Box>
  );
};

interface BulkPermissionPromptProps {
  tools: string[];
  onResolve: (allowed: string[]) => void;
}

export const BulkPermissionPrompt = ({
  tools,
  onResolve,
}: BulkPermissionPromptProps) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      borderBackgroundColor={bg}
      paddingX={1}
      width="100%"
      marginTop={1}
      backgroundColor={bg}
    >
      <Text color={theme.brand} bold backgroundColor={bg}>
        Setup · approve tools
      </Text>
      <Text color={theme.muted} wrap="truncate" backgroundColor={bg}>
        {tools.slice(0, 20).join(", ")}
        {tools.length > 20 ? "…" : ""}
      </Text>
      <Text color={theme.dim} backgroundColor={bg}>
        a = all · or comma-separated names · n = none
      </Text>
      <InputArea
        placeholder="a / n / tool names"
        onSubmit={(val) => {
          const v = val.trim().toLowerCase();
          if (v === "a") onResolve(tools);
          else if (v === "n" || v === "") onResolve([]);
          else {
            const picked = val
              .split(",")
              .map((s) => s.trim())
              .filter((name) => tools.includes(name));
            onResolve(picked);
          }
        }}
      />
    </Box>
  );
};
