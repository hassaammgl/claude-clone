import { useState, useEffect, useRef } from "react";
import { AgentLoop } from "../agent/loop";
import { createContext } from "../agent/context";
import type { SessionStats } from "../agent/context";
import type { Message } from "../agent/messages";
import { execSync } from "child_process";
import { loadSettings } from "../config/settings";
import type { PermissionChoice } from "../permissions/engine";
import { saveSession } from "../agent/session-store";

export function useAgentSession(initialPrompt?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isWaitingInput, setIsWaitingInput] = useState(true);
  const [streamingContent, setStreamingContent] = useState("");
  const [permissionRequest, setPermissionRequest] = useState<{
    toolName: string;
    input: unknown;
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
  const [modelLabel, setModelLabel] = useState("detecting…");
  const [provider, setProvider] = useState("…");
  const [ollamaModel, setOllamaModel] = useState<string | undefined>();
  const [toolMode, setToolMode] = useState(
    () => loadSettings().ollamaToolMode || "auto",
  );
  const [alwaysAllowed, setAlwaysAllowed] = useState<string[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [gitBranch, setGitBranch] = useState("n/a");
  const [duration, setDuration] = useState("00:00:00");
  const loopRef = useRef<AgentLoop | null>(null);

  const syncAgentMeta = (loop: AgentLoop) => {
    setProvider(loop.getProvider());
    setOllamaModel(loop.getOllamaModel());
    setModelLabel(loop.getModelLabel());
    setAlwaysAllowed(loop.getAlwaysAllowed());
    setToolMode(loadSettings().ollamaToolMode || "auto");
  };

  useEffect(() => {
    const context = createContext(initialPrompt);
    setMessages([...context.messages]);

    const loop = new AgentLoop(context, {
      onStreamContent: (text) => setStreamingContent(text),
      onStreamComplete: () => setStreamingContent(""),
      onContextUpdate: (newContext) => {
        setMessages([...newContext.messages]);
        setStats({ ...newContext.stats });
        saveSession(newContext);
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
    syncAgentMeta(loop);
    setStats({ ...context.stats });

    try {
      setGitBranch(
        execSync("git branch --show-current", { encoding: "utf8" }).trim() ||
          "n/a",
      );
    } catch {
      setGitBranch("n/a");
    }

    if (initialPrompt) {
      setIsWaitingInput(false);
      void loop.start();
    }

    const timer = setInterval(() => {
      const ms = Date.now() - context.stats.startTime;
      const h = Math.floor(ms / 3600000).toString().padStart(2, "0");
      const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, "0");
      const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
      setDuration(`${h}:${m}:${s}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [initialPrompt]);

  return {
    loopRef,
    messages,
    isWaitingInput,
    setIsWaitingInput,
    streamingContent,
    permissionRequest,
    setPermissionRequest,
    questionRequest,
    setQuestionRequest,
    bulkPermissionRequest,
    setBulkPermissionRequest,
    modelLabel,
    provider,
    ollamaModel,
    toolMode,
    alwaysAllowed,
    setAlwaysAllowed,
    stats,
    gitBranch,
    duration,
    syncAgentMeta,
  };
}
