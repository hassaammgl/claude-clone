import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { Header } from "./components/Header";
import { MessageLog } from "./components/MessageLog";
import { InputArea } from "./components/InputArea";
import { StatusBar } from "./components/StatusBar";
import { Sidebar } from "./components/Sidebar";
import { FileTree } from "./components/FileTree";
import { SettingsPanel } from "./components/SettingsPanel";
import type { SettingsScreen } from "./components/SettingsBody";
import {
  PermissionPrompt,
  QuestionPrompt,
  BulkPermissionPrompt,
} from "./components/PermissionPrompt";
import { theme } from "./theme";
import { useAgentSession } from "./useAgentSession";
import { version as appVersion } from "../../package.json";
import { ThinkingLabel } from "./components/Motion";
import { MouseProvider } from "./mouse/MouseContext";
import { looksLikeMouseLeak } from "./mouse/parse";

interface AppProps {
  initialPrompt?: string;
}

/** Fixed pane sizes — must sum with chat to exactly `cols`. */
const FILE_TREE_WIDTH = 26;
const CONTEXT_WIDTH = 22;
const STATUS_HEIGHT = 1;
const HEADER_HEIGHT = 1;
const INPUT_HEIGHT = 3;

type FocusPane = "files" | "chat";

function layoutFor(cols: number): {
  showFiles: boolean;
  showContext: boolean;
  fileW: number;
  ctxW: number;
  chatW: number;
} {
  // Prefer Files over Context when space is tight.
  if (cols >= 110) {
    return {
      showFiles: true,
      showContext: true,
      fileW: FILE_TREE_WIDTH,
      ctxW: CONTEXT_WIDTH,
      chatW: cols - FILE_TREE_WIDTH - CONTEXT_WIDTH,
    };
  }
  if (cols >= 72) {
    return {
      showFiles: true,
      showContext: false,
      fileW: FILE_TREE_WIDTH,
      ctxW: 0,
      chatW: cols - FILE_TREE_WIDTH,
    };
  }
  return {
    showFiles: false,
    showContext: false,
    fileW: 0,
    ctxW: 0,
    chatW: cols,
  };
}

const App = ({ initialPrompt }: AppProps) => {
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen | null>(
    null,
  );
  const [focus, setFocus] = useState<FocusPane>("chat");
  const session = useAgentSession(initialPrompt);
  const { stdout } = useStdout();
  const cols = stdout?.columns || process.stdout.columns || 100;
  const rows = stdout?.rows || process.stdout.rows || 40;
  const { showFiles, showContext, fileW, ctxW, chatW } = layoutFor(cols);
  const tokens = session.stats?.totalTokens || { input: 0, output: 0 };
  const cwd = process.cwd();

  const mainHeight = Math.max(10, rows - STATUS_HEIGHT);
  const overlayOpen =
    settingsScreen !== null ||
    !!session.permissionRequest ||
    !!session.questionRequest ||
    !!session.bulkPermissionRequest;

  const bottomReserved =
    INPUT_HEIGHT + (session.isWaitingInput || overlayOpen ? 0 : 1);
  const messageHeight = Math.max(
    5,
    mainHeight - HEADER_HEIGHT - bottomReserved - (overlayOpen ? 6 : 0),
  );

  useInput((input, key) => {
    if (looksLikeMouseLeak(input)) return;
    if (!key.tab) return;
    if (!showFiles) {
      setFocus("chat");
      return;
    }
    setFocus((prev) => (prev === "files" ? "chat" : "files"));
  });

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !session.loopRef.current) return;
    if (trimmed === "/settings" || trimmed === "/config") {
      setSettingsScreen("menu");
      return;
    }
    if (trimmed === "/setup") {
      setSettingsScreen("setup");
      return;
    }
    session.setIsWaitingInput(false);
    setFocus("chat");
    void session.loopRef.current.submitUserMessage(trimmed);
  };

  const filesHit = showFiles
    ? { x: 0, y: 0, width: fileW, height: mainHeight }
    : undefined;
  const chatHit = {
    x: showFiles ? fileW : 0,
    y: HEADER_HEIGHT,
    width: chatW,
    height: messageHeight,
  };

  return (
    <MouseProvider>
    <Box
      flexDirection="column"
      width={cols}
      height={rows}
      overflow="hidden"
      backgroundColor={theme.bg}
    >
      <Box
        flexDirection="row"
        width={cols}
        height={mainHeight}
        overflow="hidden"
        backgroundColor={theme.bg}
      >
        {showFiles && (
          <FileTree
            cwd={cwd}
            width={fileW}
            height={mainHeight}
            focused={focus === "files"}
            hitRect={filesHit}
            onMouseFocus={() => {
              if (!overlayOpen) setFocus("files");
            }}
          />
        )}

        <Box
          flexDirection="column"
          width={chatW}
          height={mainHeight}
          paddingX={1}
          overflow="hidden"
          backgroundColor={theme.bg}
        >
          <Header
            modelLabel={session.modelLabel}
            busy={!session.isWaitingInput && !overlayOpen}
          />

          <MessageLog
            messages={session.messages}
            streamingContent={session.streamingContent}
            height={messageHeight}
            focused={focus === "chat" && !overlayOpen}
            inputActive={session.isWaitingInput && focus === "chat"}
            hitRect={chatHit}
            onMouseFocus={() => {
              if (!overlayOpen) setFocus("chat");
            }}
          />

          {session.permissionRequest && (
            <PermissionPrompt
              toolName={session.permissionRequest.toolName}
              input={session.permissionRequest.input}
              onDecide={(choice) => {
                session.permissionRequest?.resolve(choice);
                session.setPermissionRequest(null);
              }}
            />
          )}

          {session.questionRequest && (
            <QuestionPrompt
              question={session.questionRequest.question}
              options={session.questionRequest.options}
              onChoose={(choice) => {
                session.questionRequest?.resolve(choice);
                session.setQuestionRequest(null);
                session.setIsWaitingInput(true);
              }}
            />
          )}

          {session.bulkPermissionRequest && (
            <BulkPermissionPrompt
              tools={session.bulkPermissionRequest.tools}
              onResolve={(allowed) => {
                session.bulkPermissionRequest?.resolve(allowed);
                session.setBulkPermissionRequest(null);
                if (session.loopRef.current) {
                  session.setAlwaysAllowed(
                    session.loopRef.current.getAlwaysAllowed(),
                  );
                }
                session.setIsWaitingInput(true);
              }}
            />
          )}

          {settingsScreen && session.loopRef.current && (
            <SettingsPanel
              initialScreen={settingsScreen}
              alwaysAllowed={session.alwaysAllowed}
              onClose={() => setSettingsScreen(null)}
              onReloadAgent={() => {
                session.loopRef.current?.reloadFromSettings();
                if (session.loopRef.current) {
                  session.syncAgentMeta(session.loopRef.current);
                }
              }}
              onApproveTools={(tools) => {
                session.loopRef.current?.approveTools(tools);
                if (session.loopRef.current) {
                  session.setAlwaysAllowed(
                    session.loopRef.current.getAlwaysAllowed(),
                  );
                }
              }}
            />
          )}

          {session.isWaitingInput && !overlayOpen && focus === "chat" && (
            <InputArea onSubmit={handleSubmit} />
          )}

          {session.isWaitingInput && !overlayOpen && focus === "files" && (
            <Box marginTop={1} backgroundColor={theme.bg}>
              <Text color={theme.dim} backgroundColor={theme.bg}>
                Files focused · tab → chat
              </Text>
            </Box>
          )}

          {!session.isWaitingInput && !overlayOpen && (
            <Box marginTop={1} backgroundColor={theme.bg}>
              <ThinkingLabel active backgroundColor={theme.bg} />
            </Box>
          )}
        </Box>

        {showContext && (
          <Sidebar
            width={ctxW}
            height={mainHeight}
            tokens={tokens}
            modelLabel={session.modelLabel}
            cwd={cwd}
            branch={session.gitBranch}
            version={appVersion}
            toolMode={session.toolMode}
            provider={session.provider}
          />
        )}
      </Box>

      <StatusBar
        cwd={cwd}
        tokens={tokens}
        busy={!session.isWaitingInput && !overlayOpen}
      />
    </Box>
    </MouseProvider>
  );
};

export default App;
