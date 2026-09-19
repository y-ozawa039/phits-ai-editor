export type ExecutionMode = "normal" | "calculationPriority";
export type Compatibility = "supported" | "newerUnverified" | "unsupportedOlder" | "unknown";
export type PhitsPathSource = "workspaceSetting" | "appSetting" | "environment" | "standardLocation" | "unavailable";
export type RunState = "launchRequested" | "running" | "stopRequested" | "completed" | "failed" | "unresolved";
export type UtilityKind = "angel" | "dchain" | "phig3d";
export type ApprovalMode = "confirmFirst" | "consultationOnly" | "onRequest" | "autonomousWorkspace";
export type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel" | "acceptWithExecPolicyAmendment";

export interface WorkspaceInfo {
  root: string;
  primaryInput: string | null;
  candidateInputs: string[];
  auxiliaryFiles: string[];
  writable: boolean;
}

export interface StartupOpenRequest {
  id: string;
  kind: "file" | "folder";
  path: string;
  workspaceRoot: string;
  relativePath?: string | null;
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
  phitsPathSource: PhitsPathSource;
  phitsVersion: string | null;
  compatibility: Compatibility;
  phitsReady: boolean;
  phitsWrapper: string | null;
  languageSpec: string | null;
  codexPath: string | null;
  codexVersion: string | null;
  codexCompatible: boolean;
  startupLog?: string | null;
  messages: string[];
}

export interface PhitsAppSettings {
  phitsRoot: string | null;
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
  compatibility: CodexCompatibilityReport;
  phitsAgentSetup: PhitsAgentSetupStatus;
}

export interface PhitsAgentSetupStatus {
  configured: boolean;
  state: PhitsAgentSetupState;
  sourcePath: string | null;
  message: string;
  checks: PhitsAgentSetupCheck[];
}

export type PhitsAgentSetupState = "confirmed" | "partial" | "mismatch" | "missing" | "unreadable";

export interface PhitsAgentSetupCheck {
  id: "resource" | "phitsRoot" | "codexGlobal" | "workspace" | "rootConsistency";
  state: PhitsAgentSetupState;
  path: string | null;
  message: string;
}

export type CodexCompatibilityState = "compatible" | "limited" | "incompatible" | "checking";
export type CodexFeatureId = "chat" | "threads" | "fileEditing" | "approvals";
export type CodexFeatureState = "available" | "limited" | "unavailable";

export interface CodexFeatureStatus {
  id: CodexFeatureId;
  state: CodexFeatureState;
  detail: string;
}

export interface CodexCompatibilityReport {
  state: CodexCompatibilityState;
  codexPath: string | null;
  codexVersion: string | null;
  baselineVersion: string;
  checkedAt: string;
  features: CodexFeatureStatus[];
  messages: string[];
}

export type WorkspaceEnvironmentState = "normal" | "attention" | "unknown";
export type WorkspaceDriveKind = "fixed" | "removable" | "network" | "optical" | "ramDisk" | "unknown";

export interface WorkspaceEnvironmentReport {
  state: WorkspaceEnvironmentState;
  workspaceRoot: string;
  checkedAt: string;
  driveKind: WorkspaceDriveKind;
  fileSystem: string | null;
  isUnc: boolean;
  isReparsePoint: boolean;
  readOnly: boolean;
  pathLength: number;
  longPathRisk: boolean;
  syncProvider: string | null;
  messages: string[];
}

export type CodexSandboxProbeState = "available" | "limited" | "unavailable";
export type CodexSandboxCheckId = "appServer" | "windowsSandbox" | "commandExecution" | "workspaceCreate" | "existingFileWrite" | "childDirectoryWrite" | "workspacePermissions";
export type CodexSandboxFailureCategory = "sandboxSetup" | "workspacePermissions" | "commandLaunch" | "verification" | "unknown";

export interface CodexSandboxCheck {
  id: CodexSandboxCheckId;
  state: CodexSandboxProbeState;
  detail: string;
}

export interface CodexSandboxProbeReport {
  state: CodexSandboxProbeState;
  workspaceRoot: string;
  checkedAt: string;
  readiness: string | null;
  implementation?: string | null;
  allowedImplementations: string[];
  failureCategory?: CodexSandboxFailureCategory | null;
  setupRecommended?: boolean;
  checks: CodexSandboxCheck[];
  messages: string[];
  supportPrompt: string;
}

export interface CodexSandboxSetupResult {
  mode: string;
  success: boolean;
  error?: string | null;
}

export interface CodexEvent {
  method: string;
  params: unknown;
}

export interface EditorSelectionContext {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text: string;
}

export interface EditorDiagnosticContext {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface EditorContextV1 {
  version: 1;
  activeDocumentPath?: string;
  activeInputPath?: string;
  activeInputDirty?: boolean;
  cursor?: { line: number; column: number };
  selection?: EditorSelectionContext;
  dirty: boolean;
  dirtyBuffer?: string;
  openDocumentPaths: string[];
  diagnostics?: EditorDiagnosticContext[];
  phitsVersion?: string;
  attachedOutputPath?: string;
  attachedOutputContent?: string;
  contentWarning?: string;
  documentRevisions?: DocumentRevisionV1[];
}

export interface CodexContextOptions {
  activeDocument: boolean;
  selection: boolean;
  diagnostics: boolean;
  attachedOutput: boolean;
}

export interface CodexFileChangeEvent {
  phase: "started" | "completed";
  threadId?: string;
  turnId?: string;
  itemId?: string;
  historyId?: string;
  status?: string;
  changes: ApprovalFileChange[];
}

export interface CodexHistoryChangeInput {
  path: string;
  afterPath?: string;
  kind: string;
}

export interface CodexHistoryFileV1 {
  relativePath: string;
  afterRelativePath: string;
  kind: string;
  beforeExisted: boolean;
  afterExisted?: boolean;
  beforeSha256?: string;
  afterSha256?: string;
  snapshotIndex: number;
}

export interface CodexChangeHistoryEntryV1 {
  schemaVersion: 1;
  historyId: string;
  createdAt: string;
  completedAt?: string;
  revertedAt?: string;
  status: "pending" | "completed" | "aborted" | "reverted";
  reviewState: "pendingReview" | "reviewed" | "reverted" | "failed";
  reviewedAt?: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  files: CodexHistoryFileV1[];
}

export interface CodexChangeGroupV1 {
  groupId: string;
  threadId?: string;
  turnId?: string;
  createdAt: string;
  reviewState: "pendingReview" | "reviewed" | "reverted" | "failed";
  historyIds: string[];
  files: string[];
}

export interface CodexHistoryPreview {
  historyId: string;
  createdAt: string;
  status: CodexChangeHistoryEntryV1["status"] | CodexChangeGroupV1["reviewState"];
  files: Array<{ path: string; afterPath: string; kind: string; original: string; modified: string }>;
}

export interface DocumentRevisionV1 {
  relativePath: string;
  diskSha256: string;
  bufferSha256: string;
  modifiedAtMs: number;
  dirty: boolean;
}

export type ApprovalKind = "fileChange" | "commandExecution" | "phitsRun" | "toolUserInput" | "mcpToolApproval";

export interface ToolInputQuestion {
  id: string; header: string; question: string;
  options?: Array<{ label: string; description: string }> | null;
  isOther?: boolean; isSecret?: boolean; required?: boolean;
  inputType?: string;
}

export interface ApprovalFileChange {
  path: string;
  kind: unknown;
  diff: string;
}

export interface ApprovalRequest {
  requestId: number | string;
  method: string;
  kind: ApprovalKind;
  workspaceRoot?: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  startedAtMs?: number;
  reason?: string | null;
  grantRoot?: string | null;
  command?: string | null;
  cwd?: string | null;
  commandActions?: unknown[] | null;
  inputRelativePath?: string | null;
  phitsRoot?: string | null;
  phitsVersion?: string | null;
  executionMode?: ExecutionMode | null;
  networkApprovalContext?: unknown;
  additionalPermissions?: unknown;
  proposedExecpolicyAmendment?: unknown;
  proposedNetworkPolicyAmendments?: unknown;
  availableDecisions?: ApprovalDecision[];
  changes: ApprovalFileChange[];
  turnDiff?: string | null;
  questions?: ToolInputQuestion[];
  serverName?: string;
  toolDescription?: string | null;
  toolArguments?: unknown;
}

export interface ApprovalResolvedEvent {
  requestId: number | string;
  threadId?: string | null;
}
