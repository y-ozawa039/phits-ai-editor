export type ExecutionMode = "normal" | "calculationPriority";
export type Compatibility = "supported" | "newerUnverified" | "unsupportedOlder" | "unknown";
export type RunState = "launchRequested" | "running" | "stopRequested" | "completed" | "failed" | "unresolved";
export type UtilityKind = "angel" | "dchain" | "phig3d";

export interface WorkspaceInfo {
  root: string;
  primaryInput: string | null;
  candidateInputs: string[];
  auxiliaryFiles: string[];
  writable: boolean;
}

export interface DocumentData {
  path: string;
  relativePath: string;
  content: string;
  encoding: "utf-8" | "utf-8-bom" | "windows-31j";
  lineEnding: "lf" | "crlf";
  modifiedAtMs: number;
}

export interface RuntimeDiagnostics {
  phitsRoot: string | null;
  phitsVersion: string | null;
  compatibility: Compatibility;
  phitsWrapper: string | null;
  languageSpec: string | null;
  codexPath: string | null;
  codexVersion: string | null;
  codexCompatible: boolean;
  messages: string[];
}

export interface RunStatus {
  runId: string;
  mode: ExecutionMode;
  state: RunState;
  message: string;
}

export interface CodexModel {
  id: string;
  displayName: string;
  isDefault: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts: string[];
}

export interface CodexThreadLink {
  threadId: string;
  title: string;
  lastUsedAt: string;
  model?: string;
  reasoningEffort?: string;
}

export interface CodexConnectResult {
  models: CodexModel[];
  activeThreadId: string | null;
  threads: CodexThreadLink[];
}

export interface CodexEvent {
  method: string;
  params: unknown;
}

export interface ApprovalRequest {
  requestId: number | string;
  method: string;
  params: unknown;
}
