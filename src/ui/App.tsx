import { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { Header } from "./components/Header";
import { MessageLog } from "./components/MessageLog";
import { InputArea } from "./components/InputArea";
import { AgentLoop } from "../agent/loop";
import { createContext } from "../agent/context";
import type { SessionStats } from "../agent/context";
import { execSync } from "child_process";
import { allTools } from "../tools/index";
import type { PermissionChoice } from "../permissions/engine";

interface AppProps {
  initialPrompt?: string;
}

const App = ({ initialPrompt }: AppProps) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [isWaitingInput, setIsWaitingInput] = useState(true);
  const [streamingContent, setStreamingContent] = useState("");
  const [permissionRequest, setPermissionRequest] = useState<{
    toolName: string;
    input: any;
    resolve: (choice: PermissionChoice) => void;
  } | null>(null);
  const [questionRequest, setQuestionRequest] = useState<{
    question: string;
    options: string[];
    resolve: (choice: string) => void;
  } | null>(null);
  const [bulkPermissionRequest, setBulkPermissionRequest] = useState<{
    tools: string[];
    resolve: (allowed: string[]) => void;
  } | null>(null);
  const [provider, setProvider] = useState<string>("detecting...");
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [gitBranch, setGitBranch] = useState<string>("");
  const [duration, setDuration] = useState<string>("00:00:00");

  const loopRef = useRef<AgentLoop | null>(null);

  useEffect(() => {
    const context = createContext(initialPrompt);
    setMessages([...context.messages]);

    const loop = new AgentLoop(context, {
      onStreamContent: (text) => setStreamingContent(text),
      onStreamComplete: () => setStreamingContent(""),
      onContextUpdate: (newContext) => {
        setMessages([...newContext.messages]);
        setStats({ ...newContext.stats });
      },
      onWaitUserInput: () => setIsWaitingInput(true),
      onAskPermission: (toolName, input, resolve) => {
        setPermissionRequest({ toolName, input, resolve });
        setIsWaitingInput(false);
      },
      onAskUserQuestion: (question, options, resolve) => {
        setQuestionRequest({ question, options, resolve });
        setIsWaitingInput(false);
      },
      onAskBulkPermission: (tools, resolve) => {
        setBulkPermissionRequest({ tools, resolve });
        setIsWaitingInput(false);
      },
      onError: (err) => {
        setMessages((prev) => [
          ...prev,
          { role: "error", content: err.message },
        ]);
        setIsWaitingInput(true);
      },
    });

    loopRef.current = loop;
    setProvider(
      loop.getProvider() === "claude"
        ? "Claude 3.5 Sonnet"
        : "Gemini 2.0 Flash",
    );
    setStats({ ...context.stats });

    try {
      const branch = execSync("git branch --show-current", {
        encoding: "utf8",
      }).trim();
      setGitBranch(branch);
    } catch (e) {
      setGitBranch("n/a");
    }

    if (initialPrompt) {
      setIsWaitingInput(false);
      loop.start();
    }

    const timer = setInterval(() => {
      if (context.stats) {
        const diff = Date.now() - context.stats.startTime;
        const h = Math.floor(diff / 3600000)
          .toString()
          .padStart(2, "0");
        const m = Math.floor((diff % 3600000) / 60000)
          .toString()
          .padStart(2, "0");
        const s = Math.floor((diff % 60000) / 1000)
          .toString()
          .padStart(2, "0");
        setDuration(`${h}:${m}:${s}`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [initialPrompt]);

  const handleSubmit = (value: string) => {
    if (!value.trim() || !loopRef.current) return;
    setIsWaitingInput(false);
    loopRef.current.submitUserMessage(value);
  };

  const handlePermissionDecision = (decision: PermissionChoice) => {
    if (!permissionRequest) return;
    const { resolve } = permissionRequest;
    setPermissionRequest(null);
    resolve(decision);
  };

  return (
    <Box flexDirection="column" flexGrow={1} width="100%" padding={1}>
      <Header
        userName="Jungle Explorer"
        version="v3.5.0"
        modelInfo={`${provider} · ${duration}`}
        currentPath={String(process.cwd())}
      />

      <MessageLog messages={messages} streamingContent={streamingContent} />

      {permissionRequest && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          padding={1}
        >
          <Text bold color="yellow">
            ⚠️ Permission Required for: {permissionRequest.toolName}
          </Text>
          <Text color="gray">
            Input: {JSON.stringify(permissionRequest.input)}
          </Text>
          <Box marginTop={1}>
            <Text color="yellow">
              Type [1] Allow once | [2] Allow always | [3] Deny:{" "}
            </Text>
            <InputArea
              onSubmit={(val) => {
                if (val === "1") handlePermissionDecision("allow_once");
                else if (val === "2") handlePermissionDecision("allow_always");
                else handlePermissionDecision("deny");
              }}
            />
          </Box>
        </Box>
      )}

      {isWaitingInput && !permissionRequest && (
        <InputArea
          onSubmit={handleSubmit}
          isBusy={false}
          statusText="Whistle a command to the Parrot"
        />
      )}

      {!isWaitingInput && !permissionRequest && (
        <Box padding={1}>
          <Text color="red" italic>
            Parrot is flying through the jungle...
          </Text>
        </Box>
      )}

      <Box paddingLeft={1} marginTop={0} width="100%">
        <Text color="gray">
          Tools: {String(allTools.length)} | Branch: {gitBranch} | Squawk! 🦜
        </Text>
      </Box>
    </Box>
  );
};

export default App;
