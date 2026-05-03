import React, { useState, useEffect, useRef } from "react";
import { AgentLoop } from "../agent/loop";
import { createContext } from "../agent/context";
import { TextAttributes, SyntaxStyle, RGBA } from "@opentui/core";
import { PermissionChoice } from "../permissions/engine";

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
  const [permissionRequest, setPermissionRequest] = useState<{toolName: string, input: any, resolve: (choice: PermissionChoice) => void} | null>(null);
  const [questionRequest, setQuestionRequest] = useState<{question: string, options: string[], resolve: (choice: string) => void} | null>(null);
  const [provider, setProvider] = useState<string>("detecting...");
  
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
      onError: (err) => {
        setMessages((prev) => [...prev, { role: "error", content: err.message }]);
        setIsWaitingInput(true);
      }
    });

    loopRef.current = loop;
    setProvider(loop.getProvider() === "claude" ? "Claude 3.5 Sonnet" : "Gemini 2.0 Flash");

    if (initialPrompt) {
      setIsWaitingInput(false);
      loop.start();
    }
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
    const answer = (num >= 1 && num <= options.length)
      ? options[num - 1]
      : options[0];
    setQuestionRequest(null);
    resolve(answer);
  };

  return (
    <box flexDirection="column" flexGrow={1} width="100%">
      <box padding={1} flexDirection="column" borderStyle="round" borderColor="cyan">
        <box justifyContent="space-between">
          <text color="cyan"><b>🤖 {provider.toUpperCase()} CLONE</b></text>
          <text color="gray">Agentic Coding CLI</text>
        </box>
        <box marginTop={1} flexDirection="column">
          <text color="white">📂 CWD: {String(process.cwd())}</text>
          <text color="white">🛠️ Tools: 27 Loaded</text>
          <text color="white">🛡️ Security: Permission Engine Active</text>
        </box>
      </box>
      
      <scrollbox flexGrow={1} flexDirection="column" padding={1} stickyScroll={true} stickyStart="bottom">
        {messages.flatMap((msg, i) => {
          if (Array.isArray(msg.content)) {
            return msg.content.map((block: any, blockIdx: number) => {
              if (block.type === "tool_use") {
                return (
                  <box key={`${i}-${blockIdx}`} flexDirection="column" margin={{ bottom: 1 }}>
                    <text color="magenta"><b>Tool Call: {String(block.name)}</b></text>
                    <text>{JSON.stringify(block.input)}</text>
                  </box>
                );
              }
              if (block.type === "tool_result") {
                return (
                  <box key={`${i}-${blockIdx}`} flexDirection="column" margin={{ bottom: 1 }}>
                    <text color={block.is_error ? "red" : "gray"}><b>Tool Result:</b></text>
                    <text>{typeof block.content === "string" ? block.content : JSON.stringify(block.content, null, 2)}</text>
                  </box>
                );
              }
              if (block.type === "text") {
                return (
                  <box key={`${i}-${blockIdx}`} flexDirection="column" margin={{ bottom: 1 }}>
                    <text color="blue"><b>Gemini:</b></text>
                    <markdown syntaxStyle={syntaxStyle} content={String(block.text)} />
                  </box>
                );
              }
              return null;
            }).filter(Boolean);
          }
 
          return [
            (
              <box key={i} flexDirection="column" margin={{ bottom: 1 }}>
                <text 
                  color={msg.role === "user" ? "green" : msg.role === "error" ? "red" : "blue"}
                >
                  <b>{msg.role === "user" ? "You:" : msg.role === "error" ? "Error:" : "Gemini:"}</b>
                </text>
                {msg.role === "user" ? (
                  <text>{typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)}</text>
                ) : (
                  <markdown syntaxStyle={syntaxStyle} content={typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)} />
                )}
              </box>
            )
          ];
        })}
        
        {!isWaitingInput && streamingContent && (
          <box flexDirection="column" margin={{ bottom: 1 }}>
            <text color="blue"><b>Gemini:</b></text>
            <markdown syntaxStyle={syntaxStyle} content={streamingContent} streaming={true} />
          </box>
        )}
      </scrollbox>
 
      {permissionRequest && (
        <box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
          <text attributes={TextAttributes.BOLD} color="yellow">⚠️ Permission Required for: {permissionRequest.toolName}</text>
          <text>Input: {JSON.stringify(permissionRequest.input)}</text>
          <box marginTop={1}>
             <text color="yellow">Type [1] Allow once | [2] Allow always | [3] Deny: </text>
             <input 
               focused={true} 
               onSubmit={(val) => {
                 const choice = val.trim();
                 if (choice === "1") handlePermissionDecision("allow_once");
                 else if (choice === "2") handlePermissionDecision("allow_always");
                 else handlePermissionDecision("deny");
               }} 
             />
          </box>
        </box>
      )}
 
      {questionRequest && (
        <box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
          <text attributes={TextAttributes.BOLD} color="cyan">❓ Gemini is asking:</text>
          <text>{questionRequest.question}</text>
          <box flexDirection="column" marginTop={1}>
            {questionRequest.options.map((opt, i) => (
              <text key={i} color="cyan">[{i + 1}] {opt}</text>
            ))}
          </box>
          <box marginTop={1}>
            <text color="cyan">Enter number: </text>
            <input
              focused={true}
              onSubmit={handleQuestionAnswer}
            />
          </box>
        </box>
      )}
 
      {isWaitingInput && !permissionRequest && !questionRequest && (
        <box flexDirection="column">
          <box paddingLeft={1}>
            <text color="gray">Status: Ready</text>
          </box>
          <box borderStyle="round" borderColor="green" padding={{ left: 1, right: 1 }}>
            <text color="green">{"> "}</text>
            <input 
              flexGrow={1}
              focused={true}
              onSubmit={handleSubmit}
            />
          </box>
        </box>
      )}
 
      {!isWaitingInput && !permissionRequest && !questionRequest && (
        <box padding={1}>
          <text color="yellow" attributes={TextAttributes.ITALIC}>Gemini is thinking...</text>
        </box>
      )}
    </box>
  );
}
