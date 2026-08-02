import type { PermissionChoice } from "../permissions/engine";
import type { SessionContext } from "./context";

export interface AgentLoopCallbacks {
  onStreamContent?: (text: string) => void;
  onStreamComplete?: (fullText: string) => void;
  onWaitUserInput?: () => void;
  onAskPermission?: (
    toolName: string,
    input: unknown,
    resolve: (choice: PermissionChoice) => void,
  ) => void;
  onAskUserQuestion?: (
    question: string,
    options: string[],
    resolve: (choice: string) => void,
  ) => void;
  onAskBulkPermission?: (
    tools: string[],
    resolve: (allowed: string[]) => void,
  ) => void;
  onContextUpdate?: (context: SessionContext) => void;
  onError?: (error: Error) => void;
}
