import { useState, useEffect, useRef } from "react";
import { AgentLoop } from "../agent/loop";
import { createContext } from "../agent/context";
import type { SessionStats } from "../agent/context";
import { TextAttributes, SyntaxStyle, RGBA } from "@opentui/core";
import type { PermissionChoice } from "../permissions/engine";
import { allTools } from "../tools/index";
import { execSync } from "child_process";

const syntaxStyle = SyntaxStyle.fromStyles({
  "markup.heading": { fg: RGBA.fromHex("#58A6FF"), bold: true },
  "markup.list": { fg: RGBA.fromHex("#FF7B72") },
  "markup.raw": { fg: RGBA.fromHex("#A5D6FF") },
  "markup.bold": { bold: true },
  "markup.italic": { italic: true },
  default: { fg: RGBA.fromHex("#E6EDF3") },
});

export function App({ initialPrompt }: { initialPrompt?: string }) {
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
      onStreamContent: (text) => {
        setStreamingContent(text);
      },
      onStreamComplete: () => {
        setStreamingContent("");
      },
      onContextUpdate: (newContext) => {
        setMessages([...newContext.messages]);
        setStats({ ...newContext.stats });
      },
      onWaitUserInput: () => {
        setIsWaitingInput(true);
      },
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

    // Get Git Branch
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

  const handleQuestionAnswer = (idx: string) => {
    if (!questionRequest) return;
    const { options, resolve } = questionRequest;
    const num = parseInt(idx.trim(), 10);
    const answer =
      num >= 1 && num <= options.length ? options[num - 1] : options[0];
    setQuestionRequest(null);
    resolve(answer ?? "");
  };

  const handleBulkPermissionAnswer = (input: string) => {
    if (!bulkPermissionRequest) return;
    const { tools, resolve } = bulkPermissionRequest;

    // Parse input like "1, 2, 5" or "1 2 5" or "all"
    const selection = input.trim().toLowerCase();
    let allowed: string[] = [];

    if (selection === "all") {
      allowed = [...tools];
    } else {
      const indices = selection.split(/[\s,]+/).map((s) => parseInt(s, 10));
      allowed = indices
        .filter((idx) => idx >= 1 && idx <= tools.length)
        .map((idx) => tools[idx - 1])
        .filter((t): t is string => t !== undefined);
    }

    setBulkPermissionRequest(null);
    resolve(allowed);
  };

  return (
    <box flexDirection="column" flexGrow={1} width="100%">
      <box
        padding={1}
        flexDirection="column"
        borderStyle="double"
        borderColor="cyan"
      >
        <box justifyContent="space-between">
          <box>
            <text fg="cyan" attributes={TextAttributes.BOLD}>
              🛸 ANTIGRAVITY
            </text>
            <text fg="gray"> • </text>
            <text fg="magenta" attributes={TextAttributes.BOLD}>
              {provider.toUpperCase()}
            </text>
          </box>
          <box>
            <text fg="yellow" attributes={TextAttributes.BOLD}>
              ⏱️ {duration}
            </text>
          </box>
        </box>

        <box marginTop={1} justifyContent="space-between">
          <box flexDirection="column">
            <box>
              <text>📂 </text>
              <text fg="blue" attributes={TextAttributes.BOLD}>
                PATH
              </text>
              <text> {String(process.cwd())}</text>
            </box>
            <box>
              <text>🌿 </text>
              <text fg="green" attributes={TextAttributes.BOLD}>
                GIT
              </text>
              <text> {gitBranch}</text>
            </box>
          </box>
          <box flexDirection="column" alignItems="flex-end">
            <box>
              <text fg="cyan" attributes={TextAttributes.BOLD}>
                TOOLS
              </text>
              <text> {String(allTools.length)} Active 🛠️</text>
            </box>
            <box>
              <text fg="green" attributes={TextAttributes.BOLD}>
                STATUS
              </text>
              <text> {isWaitingInput ? "Ready" : "Busy"} 🛡️</text>
            </box>
          </box>
        </box>

        <box
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
          justifyContent="space-between"
        >
          <box>
            <text fg="gray">MESSAGES </text>
            <text fg="white" attributes={TextAttributes.BOLD}>
              {String(stats?.messageCount || 0)}
            </text>
          </box>
          <box>
            <text fg="gray">CALLS </text>
            <text fg="white" attributes={TextAttributes.BOLD}>
              {String(stats?.toolCallCount || 0)}
            </text>
          </box>
          <box>
            <text fg="gray">INPUT </text>
            <text fg="white" attributes={TextAttributes.BOLD}>
              {String(stats?.totalTokens.input || 0)}
            </text>
          </box>
          <box>
            <text fg="gray">OUTPUT </text>
            <text fg="white" attributes={TextAttributes.BOLD}>
              {String(stats?.totalTokens.output || 0)}
            </text>
          </box>
          <box>
            <text fg="gray">TOTAL </text>
            <text fg="cyan" attributes={TextAttributes.BOLD}>
              {String(
                (stats?.totalTokens.input || 0) +
                  (stats?.totalTokens.output || 0),
              )}
            </text>
          </box>
        </box>

        <box
          marginTop={1}
          borderStyle="single"
          borderColor="gray"
          paddingLeft={1}
          paddingRight={1}
          justifyContent="space-around"
        >
          <box>
            <text fg="gray">TASKS: </text>
            <text fg="cyan">
              {String(loopRef.current?.getContext().tasks.length || 0)}
            </text>
          </box>
          <box>
            <text fg="gray">CRON: </text>
            <text fg="yellow">
              {String(loopRef.current?.getContext().cronJobs.size || 0)}
            </text>
          </box>
          <box>
            <text fg="gray">MCP: </text>
            <text fg="magenta">
              {String(
                loopRef.current?.getContext().mcpManager.getServers().length ||
                  0,
              )}
            </text>
          </box>
          <box>
            <text fg="gray">JOBS: </text>
            <text fg="green">
              {String(
                loopRef.current?.getContext().backgroundProcesses.size || 0,
              )}
            </text>
          </box>
        </box>
      </box>

      <scrollbox
        flexGrow={1}
        flexDirection="column"
        padding={1}
        stickyScroll={true}
        stickyStart="bottom"
      >
        {messages.flatMap((msg, i) => {
          if (Array.isArray(msg.content)) {
            return msg.content
              .map((block: any, blockIdx: number) => {
                if (block.type === "tool_use") {
                  return (
                    <box
                      key={`${i}-${blockIdx}`}
                      flexDirection="column"
                      marginBottom={1}
                    >
                      <text fg="magenta" attributes={TextAttributes.BOLD}>
                        Tool Call: {String(block.name)}
                      </text>
                      <text>{JSON.stringify(block.input)}</text>
                    </box>
                  );
                }
                if (block.type === "tool_result") {
                  return (
                    <box
                      key={`${i}-${blockIdx}`}
                      flexDirection="column"
                      marginBottom={1}
                    >
                      <text
                        fg={block.is_error ? "red" : "gray"}
                        attributes={TextAttributes.BOLD}
                      >
                        Tool Result:
                      </text>
                      <text>
                        {typeof block.content === "string"
                          ? block.content
                          : JSON.stringify(block.content, null, 2)}
                      </text>
                    </box>
                  );
                }
                if (block.type === "text") {
                  return (
                    <box
                      key={`${i}-${blockIdx}`}
                      flexDirection="column"
                      marginBottom={1}
                    >
                      <text fg="blue" attributes={TextAttributes.BOLD}>
                        Gemini:
                      </text>
                      <markdown
                        syntaxStyle={syntaxStyle}
                        content={String(block.text)}
                      />
                      {msg.usage && blockIdx === msg.content.length - 1 && (
                        <box marginTop={0}>
                          <text fg="gray" attributes={TextAttributes.ITALIC}>
                            [tokens: {String(msg.usage.input)} in,{" "}
                            {String(msg.usage.output)} out]
                          </text>
                        </box>
                      )}
                    </box>
                  );
                }
                return null;
              })
              .filter(Boolean);
          }

          return [
            <box key={i} flexDirection="column" marginBottom={1}>
              <text
                fg={
                  msg.role === "user"
                    ? "green"
                    : msg.role === "error"
                      ? "red"
                      : "blue"
                }
                attributes={TextAttributes.BOLD}
              >
                {msg.role === "user"
                  ? "You:"
                  : msg.role === "error"
                    ? "Error:"
                    : "Gemini:"}
              </text>
              {msg.role === "user" ? (
                <text>
                  {typeof msg.content === "string"
                    ? msg.content
                    : JSON.stringify(msg.content, null, 2)}
                </text>
              ) : (
                <markdown
                  syntaxStyle={syntaxStyle}
                  content={
                    typeof msg.content === "string"
                      ? msg.content
                      : JSON.stringify(msg.content, null, 2)
                  }
                />
              )}
              {msg.role === "assistant" && msg.usage && (
                <box marginTop={0}>
                  <text fg="gray" attributes={TextAttributes.ITALIC}>
                    [tokens: {String(msg.usage.input)} in,{" "}
                    {String(msg.usage.output)} out]
                  </text>
                </box>
              )}
            </box>,
          ];
        })}

        {!isWaitingInput && streamingContent && (
          <box flexDirection="column" marginBottom={1}>
            <text fg="blue" attributes={TextAttributes.BOLD}>
              Gemini:
            </text>
            <markdown
              syntaxStyle={syntaxStyle}
              content={streamingContent}
              streaming={true}
            />
          </box>
        )}
      </scrollbox>

      {permissionRequest && (
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="yellow"
          padding={1}
        >
          <text attributes={TextAttributes.BOLD} fg="yellow">
            ⚠️ Permission Required for: {permissionRequest.toolName}
          </text>
          <text>Input: {JSON.stringify(permissionRequest.input)}</text>
          <box marginTop={1}>
            <text fg="yellow">
              Type [1] Allow once | [2] Allow always | [3] Deny:{" "}
            </text>
            <input
              focused={true}
              onSubmit={(val: any) => {
                const choice = val?.trim();
                if (choice === "1") handlePermissionDecision("allow_once");
                else if (choice === "2")
                  handlePermissionDecision("allow_always");
                else handlePermissionDecision("deny");
              }}
            />
          </box>
        </box>
      )}

      {questionRequest && (
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="cyan"
          padding={1}
        >
          <text attributes={TextAttributes.BOLD} fg="cyan">
            ❓ Gemini is asking:
          </text>
          <text>{questionRequest.question}</text>
          <box flexDirection="column" marginTop={1}>
            {questionRequest.options.map((opt, i) => (
              <text key={i} fg="cyan">
                [{String(i + 1)}] {opt}
              </text>
            ))}
          </box>
          <box marginTop={1}>
            <text fg="cyan">Enter number: </text>
            <input
              focused={true}
              onSubmit={(val: any) => handleQuestionAnswer(val)}
            />
          </box>
        </box>
      )}

      {bulkPermissionRequest && (
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="magenta"
          padding={1}
        >
          <text attributes={TextAttributes.BOLD} fg="magenta">
            🛡️ Bulk Permission Setup
          </text>
          <text>Select tools to pre-approve (always allowed):</text>
          <box flexDirection="column" marginTop={1}>
            {bulkPermissionRequest.tools.map((tool, i) => (
              <text key={i} fg="magenta">
                [{String(i + 1)}] {tool}
              </text>
            ))}
          </box>
          <box marginTop={1}>
            <text fg="magenta">Enter numbers (e.g. 1,2,5) or "all": </text>
            <input
              focused={true}
              onSubmit={(val: any) => handleBulkPermissionAnswer(val)}
            />
          </box>
        </box>
      )}

      {isWaitingInput &&
        !permissionRequest &&
        !questionRequest &&
        !bulkPermissionRequest && (
          <box flexDirection="column">
            <box paddingLeft={1}>
              <text fg="gray">Status: Ready</text>
            </box>
            <box
              borderStyle="rounded"
              borderColor="green"
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg="green">{"> "}</text>
              <input
                flexGrow={1}
                focused={true}
                onSubmit={(val: any) => handleSubmit(val)}
              />
            </box>
          </box>
        )}

      {!isWaitingInput &&
        !permissionRequest &&
        !questionRequest &&
        !bulkPermissionRequest && (
          <box padding={1}>
            <text fg="yellow" attributes={TextAttributes.ITALIC}>
              Gemini is thinking...
            </text>
          </box>
        )}
    </box>
  );
}
