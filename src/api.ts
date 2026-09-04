import { invoke } from "@tauri-apps/api/core";
import type { ApprovalRequest, CodexConnectResult, DocumentData, RuntimeDiagnostics, UtilityKind, WorkspaceInfo } from "./types";

export const api = {
  openWorkspace: (path: string) => invoke<WorkspaceInfo>("workspace_open", { path }),
  readDocument: (workspaceRoot: string, relativePath: string) => invoke<DocumentData>("document_read", { workspaceRoot, relativePath }),
  saveDocument: (workspaceRoot: string, document: DocumentData, content: string) => invoke<DocumentData>("document_save", { workspaceRoot, document, content }),
  saveDocumentAs: (workspaceRoot: string, targetPath: string, content: string, sourceDocument?: DocumentData | null) => invoke<DocumentData>("document_save_as", { workspaceRoot, targetPath, content, sourceDocument: sourceDocument ?? null }),
  diagnostics: (workspaceRoot?: string) => invoke<RuntimeDiagnostics>("runtime_diagnose", { workspaceRoot }),
  loadLanguageSpec: (phitsRoot?: string) => invoke<unknown>("language_spec_load", { phitsRoot }),
  runNormal: (workspaceRoot: string, overrideUnresolved = false) => invoke("run_phits_normal", { workspaceRoot, overrideUnresolved }),
  runProduction: (workspaceRoot: string, overrideUnresolved = false) => invoke("run_phits_production", { workspaceRoot, overrideUnresolved }),
  stopGracefully: (workspaceRoot: string) => invoke("run_phits_stop_graceful", { workspaceRoot }),
  runUtility: (workspaceRoot: string, kind: UtilityKind, relativePath: string) => invoke("run_utility", { workspaceRoot, kind, relativePath }),
  codexConnect: (workspaceRoot: string) => invoke<CodexConnectResult>("codex_connect", { workspaceRoot }),
  codexDisconnect: () => invoke("codex_disconnect"),
  codexThreadStart: (workspaceRoot: string, model?: string, reasoningEffort?: string) => invoke<string>("codex_thread_start", { workspaceRoot, model, reasoningEffort }),
  codexThreadResume: (workspaceRoot: string, threadId: string) => invoke("codex_thread_resume", { workspaceRoot, threadId }),
  codexTurnStart: (threadId: string, text: string, model?: string, reasoningEffort?: string) => invoke("codex_turn_start", { threadId, text, model, reasoningEffort }),
  codexTurnInterrupt: (threadId: string, turnId: string) => invoke("codex_turn_interrupt", { threadId, turnId }),
  resolveApproval: (request: ApprovalRequest, decision: "accept" | "decline") => invoke("codex_approval_resolve", { requestId: request.requestId, method: request.method, decision })
};
