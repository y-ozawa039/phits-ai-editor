import Editor, { DiffEditor, type BeforeMount, type OnMount } from "@monaco-editor/react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { api } from "./api";
import { approvalRequestKey, normalizeApprovalRequest, sameRequestId, stripAnsi } from "./codexApproval";
import { boundedEditorContext, defaultContextOptions, visibleHistoryText } from "./codexContext";
import { hasDocumentRevisionConflict } from "./codexRevision";
import { codexTurnId, isCodexTurnCompleted, isCodexTurnStarted } from "./codexEvents";
import { CodexPanel, type ChatMessage, type ComposerDraftRequest } from "./components/CodexPanel";
import { CodexCompatibilityStatus } from "./components/CodexCompatibilityStatus";
import { DiffReview, type CompletedChangeChoice } from "./components/DiffReview";
import { EditorTabs } from "./components/EditorTabs";
import { Icon } from "./components/Icons";
import { OutputPanel } from "./components/OutputPanel";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { registerPhitsLanguage } from "./phitsLanguage";
import { buildPhitsAgentSetupHelp } from "./phitsAgentSetupHelp";
import packageMetadata from "../package.json";
import { changeKindValue, makeDiffReviewFile, mergeAppliedDiffReviewFiles, movePathValue, type DiffReviewFile, type DiffReviewState } from "./diffReview";
import { DIAGNOSTICS_RAPID_GAP_MS, DIAGNOSTICS_RAPID_THRESHOLD_MS, DIAGNOSTICS_TURN_BASE_MS, diagnosticsTurnDuration, shouldRequestDiagnostics } from "./diagnosticsMotion";
import { applyUndoableModelContent, asUndoableTextModel, runUndoableModelHistory } from "./editorHistory";
import type { ApprovalDecision, ApprovalFileChange, ApprovalMode, ApprovalRequest, ApprovalResolvedEvent, CodexChangeGroupV1, CodexCompatibilityReport, CodexContextOptions, CodexEvent, CodexFeatureId, CodexFileChangeEvent, CodexHistoryPreview, CodexModel, CodexThreadLink, DocumentData, DocumentRevisionV1, EditorContextV1, EditorSelectionContext, PhitsAgentSetupStatus, RunStatus, RuntimeDiagnostics, StartupOpenRequest, UtilityKind, WorkspaceInfo } from "./types";
import { codexPanelWidth, DEFAULT_CODEX_PANEL_RATIO, FONT_SIZE_PRESETS, loadFontSizeDefaults, loadUiPreferences, MAX_CODEX_PANEL_RATIO, MAX_FONT_SIZE, MIN_CODEX_PANEL_WIDTH, MIN_FONT_SIZE, normalizeCodexPanelRatio, saveFontSizeDefaults, saveUiPreferences } from "./uiPreferences";
import { closeTopMenus } from "./topMenu";
import { loadWorkspaceSession, saveWorkspaceSession } from "./workspaceSession";

interface OpenDocument {
  id: string;
  name: string;
  document: DocumentData | null;
  content: string;
  dirty: boolean;
}

type ToastKind = "info" | "success" | "error";
interface Toast { id: number; kind: ToastKind; message: string }

interface CloseDocumentPrompt {
  documentId: string;
  busy: boolean;
}

interface OpenWorkspaceOptions {
  preferredInput?: string;
  openPaths?: string[];
  activePath?: string;
  restoreRunState?: boolean;
}

interface WorkspaceSwitchPrompt {
  root: string;
  options: OpenWorkspaceOptions;
  documentIds: string[];
  busy: boolean;
}

interface CloseApplicationPrompt {
  documentIds: string[];
  busy: boolean;
}

interface FontSizeControlProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function FontSizeControl({ label, value, onChange }: FontSizeControlProps) {
  const [draft, setDraft] = useState(String(value));
  const [presetsOpen, setPresetsOpen] = useState(false);
  const presetPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(String(value)), [value]);

  useEffect(() => {
    if (!presetsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!presetPickerRef.current?.contains(event.target as Node)) setPresetsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresetsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [presetsOpen]);

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(parsed)));
    setDraft(String(next));
    onChange(next);
  };

  return <div className="font-setting" role="group" aria-label={`${label}のフォントサイズ`}>
    <strong>{label}</strong>
    <div className="font-stepper">
      <div className="font-size-combo">
        <input aria-label={`${label}のフォントサイズを入力`} type="number" inputMode="numeric" min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} step="1" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={(event) => { if (event.key === "Enter") { commitDraft(); event.currentTarget.blur(); } }}/>
        <div className="font-preset-picker" ref={presetPickerRef}>
          <button type="button" className="font-size-dropdown" aria-label={`${label}のフォントサイズ候補を開く`} aria-haspopup="listbox" aria-expanded={presetsOpen} onClick={() => setPresetsOpen((open) => !open)}><span aria-hidden="true">▾</span></button>
          {presetsOpen && <div className="font-preset-menu" role="listbox" aria-label={`${label}のフォントサイズ候補`}>
            {FONT_SIZE_PRESETS.map((size) => <button type="button" role="option" aria-selected={size === value} className={size === value ? "selected" : ""} key={size} onClick={() => { onChange(size); setPresetsOpen(false); }}>{size}</button>)}
          </div>}
        </div>
      </div>
      <button type="button" className="font-grow-button" aria-label={`${label}のフォントサイズを大きくする`} title="1px大きくする" disabled={value >= MAX_FONT_SIZE} onClick={() => onChange(Math.min(MAX_FONT_SIZE, value + 1))}><span aria-hidden="true">A<sup>↑</sup></span></button>
      <button type="button" className="font-shrink-button" aria-label={`${label}のフォントサイズを小さくする`} title="1px小さくする" disabled={value <= MIN_FONT_SIZE} onClick={() => onChange(Math.max(MIN_FONT_SIZE, value - 1))}><span aria-hidden="true">A<sup>↓</sup></span></button>
    </div>
  </div>;
}

const EVENT_NAMES = {
  output: ["phits-output", "phits://output"],
  run: ["phits://state", "phits-run-status", "phits://run-status"],
  codex: ["codex-event", "codex://event"],
  approval: ["codex-approval", "codex://approval"],
  approvalResolved: ["codex://approval-resolved"],
  diagnostics: ["diagnostics-changed", "runtime://diagnostics"],
  codexLog: ["codex://log"],
  codexDisconnected: ["codex://disconnected"],
  codexFileChange: ["codex://file-change"],
} as const;

const isTauri = () => "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
const fileName = (path: string) => path.split(/[\\/]/).pop() || path;
const normalizedPath = (path: string) => path.replace(/\\/g, "/").replace(/\/$/, "").toLocaleLowerCase();
const samePath = (left: string, right: string) => normalizedPath(left) === normalizedPath(right);
const isPhitsInputPath = (path: string) => /\.(?:inp|pht)$/i.test(path);

function payloadText(payload: unknown): string {
  if (typeof payload === "string") return stripAnsi(payload);
  if (typeof payload !== "object" || payload === null) return "";
  const value = payload as Record<string, unknown>;
  for (const key of ["text", "delta", "message", "output", "content"]) if (typeof value[key] === "string") return stripAnsi(value[key] as string);
  return "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function historyMessages(value: unknown): ChatMessage[] {
  if (typeof value !== "object" || value === null) return [];
  const thread = (value as Record<string, unknown>).thread;
  if (typeof thread !== "object" || thread === null) return [];
  const turns = (thread as Record<string, unknown>).turns;
  if (!Array.isArray(turns)) return [];
  const messages: ChatMessage[] = [];
  for (const turn of turns) {
    if (typeof turn !== "object" || turn === null) continue;
    const items = (turn as Record<string, unknown>).items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      if (record.type === "agentMessage" && typeof record.text === "string") {
        messages.push({ id: String(record.id ?? crypto.randomUUID()), role: "assistant", text: record.text });
      } else if (record.type === "userMessage" && Array.isArray(record.content)) {
        const text = visibleHistoryText(record.content.map(payloadText).filter(Boolean));
        if (text) messages.push({ id: String(record.id ?? crypto.randomUUID()), role: "user", text });
      }
    }
  }
  return messages;
}

function compatibilityLabel(value?: RuntimeDiagnostics["compatibility"]) {
  if (value === "supported") return "対応";
  if (value === "newerUnverified") return "新しい版（未検証）";
  if (value === "unsupportedOlder") return "非対応（旧版）";
  return "未検出";
}

function phitsPathSourceLabel(value?: RuntimeDiagnostics["phitsPathSource"]) {
  if (value === "workspaceSetting") return "ワークスペース設定";
  if (value === "appSetting") return "アプリ設定";
  if (value === "environment") return "環境変数 PHITSPATH";
  if (value === "standardLocation") return "標準位置から自動検出";
  return "未検出";
}

function codexFeatureAvailable(report: CodexCompatibilityReport | null, id: CodexFeatureId) {
  return report?.features.find((feature) => feature.id === id)?.state === "available";
}

export default function App() {
  const [initialUiPreferences] = useState(loadUiPreferences);
  const [initialFontSizeDefaults] = useState(loadFontSizeDefaults);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [diagnosticsQueuedTurns, setDiagnosticsQueuedTurns] = useState(0);
  const [codexCompatibility, setCodexCompatibility] = useState<CodexCompatibilityReport | null>(null);
  const [phitsAgentSetup, setPhitsAgentSetup] = useState<PhitsAgentSetupStatus | null>(null);
  const [codexConnectionError, setCodexConnectionError] = useState<string | null>(null);
  const [codexProbeBusy, setCodexProbeBusy] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(initialUiPreferences.sidebarOpen);
  const [codexOpen, setCodexOpen] = useState(initialUiPreferences.codexOpen);
  const [codexPanelRatio, setCodexPanelRatio] = useState(initialUiPreferences.codexPanelRatio);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [outputHeight, setOutputHeight] = useState(206);
  const [outputCollapsed, setOutputCollapsed] = useState(!initialUiPreferences.outputOpen);
  const [explorerFontSize, setExplorerFontSize] = useState(initialUiPreferences.explorerFontSize);
  const [editorFontSize, setEditorFontSize] = useState(initialUiPreferences.editorFontSize);
  const [codexFontSize, setCodexFontSize] = useState(initialUiPreferences.codexFontSize);
  const [fontSizeDefaults, setFontSizeDefaults] = useState(initialFontSizeDefaults);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexBusy, setCodexBusy] = useState(false);
  const [models, setModels] = useState<CodexModel[]>([]);
  const [threadLinks, setThreadLinks] = useState<CodexThreadLink[]>([]);
  const [model, setModel] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turnId, setTurnId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(initialUiPreferences.approvalMode);
  const [sessionApprovalActive, setSessionApprovalActive] = useState(false);
  const [selection, setSelection] = useState<EditorSelectionContext | undefined>();
  const [contextOptions, setContextOptions] = useState<CodexContextOptions>(defaultContextOptions);
  const [attachedOutput, setAttachedOutput] = useState<{ path: string; content: string } | null>(null);
  const [draftRequest, setDraftRequest] = useState<ComposerDraftRequest | null>(null);
  const [conflictedPaths, setConflictedPaths] = useState<Set<string>>(() => new Set());
  const [conflict, setConflict] = useState<{ path: string; disk: DocumentData; entryId: string } | null>(null);
  const [diffReview, setDiffReview] = useState<DiffReviewState | null>(null);
  const [pendingReviewPaths, setPendingReviewPaths] = useState<Set<string>>(() => new Set());
  const [editorHistoryRevision, setEditorHistoryRevision] = useState(0);
  const [closeDocumentPrompt, setCloseDocumentPrompt] = useState<CloseDocumentPrompt | null>(null);
  const [workspaceSwitchPrompt, setWorkspaceSwitchPrompt] = useState<WorkspaceSwitchPrompt | null>(null);
  const [closeApplicationPrompt, setCloseApplicationPrompt] = useState<CloseApplicationPrompt | null>(null);
  const [settingsSection, setSettingsSection] = useState<"appearance" | "phits" | null>(null);
  const [phitsSettingsMode, setPhitsSettingsMode] = useState<"auto" | "custom">("auto");
  const [phitsPathDraft, setPhitsPathDraft] = useState("");
  const [phitsSettingsSaving, setPhitsSettingsSaving] = useState(false);

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const workspaceRef = useRef<WorkspaceInfo | null>(null);
  const documentsRef = useRef<OpenDocument[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const languageDisposeRef = useRef<{ dispose(): void } | null>(null);
  const languageSpecRef = useRef<unknown>(undefined);
  const diagnosticsRequestCountRef = useRef(0);
  const codexCompatibilityRef = useRef<CodexCompatibilityReport | null>(null);
  const codexProbeBusyRef = useRef(false);
  const diagnosticsRotorRef = useRef<HTMLSpanElement | null>(null);
  const diagnosticsPulseRef = useRef<HTMLSpanElement | null>(null);
  const diagnosticsMotionRef = useRef({
    spinning: false,
    rapidMode: false,
    rapidStartedAt: 0,
    lastClickAt: 0,
    rapidClicks: 0,
    queuedTurns: 0,
    normalAnimation: null as Animation | null,
    queuedAnimation: null as Animation | null,
    pulseAnimation: null as Animation | null,
  });
  const toastCounter = useRef(0);
  const menuBarRef = useRef<HTMLElement | null>(null);
  const turnRevisionsRef = useRef<Map<string, DocumentRevisionV1>>(new Map());
  const fileChangeBasesRef = useRef<Map<string, Promise<DiffReviewFile[]>>>(new Map());
  const turnDocumentBasesRef = useRef<Map<string, string>>(new Map());
  const turnDiffFilesRef = useRef<Map<string, DiffReviewFile[]>>(new Map());
  const turnHistoryIdsRef = useRef<Map<string, string[]>>(new Map());
  const activeTurnIdRef = useRef<string | null>(null);
  const startupInitializedRef = useRef(false);
  const handledStartupRequestsRef = useRef<Set<string>>(new Set());
  const allowApplicationCloseRef = useRef(false);
  const activeDocument = documents.find((entry) => entry.id === activeId) ?? null;
  const hasDirtyDocuments = documents.some((entry) => entry.dirty);
  const codexWidth = codexPanelWidth(viewportWidth, codexPanelRatio);

  useEffect(() => { documentsRef.current = documents; }, [documents]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    const activePath = documents.find((entry) => entry.id === activeId)?.document?.relativePath;
    saveWorkspaceSession({
      root: workspace.root,
      openDocumentPaths: documents.flatMap((entry) => entry.document ? [entry.document.relativePath] : []),
      activeDocumentPath: activePath,
      activeInputPath: workspace.primaryInput ?? undefined,
    });
  }, [activeId, documents, workspace]);

  useEffect(() => {
    saveUiPreferences({
      sidebarOpen,
      codexOpen,
      outputOpen: !outputCollapsed,
      explorerFontSize,
      editorFontSize,
      codexFontSize,
      codexPanelRatio,
      approvalMode,
    });
  }, [approvalMode, codexFontSize, codexOpen, codexPanelRatio, editorFontSize, explorerFontSize, outputCollapsed, sidebarOpen]);

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++toastCounter.current;
    setToasts((current) => [...current.slice(-2), { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);

  const appendOutput = useCallback((value: string) => {
    const lines = value.replace(/\r/g, "").split("\n").filter((line, index, all) => line || index < all.length - 1);
    if (lines.length) setOutput((current) => [...current, ...lines].slice(-4000));
  }, []);

  const codexUnavailableReason = useMemo(() => codexConnectionError ?? (
    codexCompatibility && !codexFeatureAvailable(codexCompatibility, "chat")
      ? "Codex CLIまたはApp Serverの会話機能を利用できません。実行環境の互換性検査結果を確認してください。"
      : null
  ), [codexCompatibility, codexConnectionError]);

  const codexTroubleshootingPrompt = useMemo(() => {
    if (!workspace || (!codexUnavailableReason && phitsAgentSetup?.configured !== false)) return null;
    return buildPhitsAgentSetupHelp({
      workspaceRoot: workspace.root,
      setup: phitsAgentSetup,
      diagnostics,
      compatibility: codexCompatibility,
      connectionError: codexUnavailableReason,
    });
  }, [codexCompatibility, codexUnavailableReason, diagnostics, phitsAgentSetup, workspace]);

  const retainedModel = useCallback((documentId: string) => {
    const monaco = monacoRef.current;
    return monaco?.editor.getModel(monaco.Uri.parse(documentId)) ?? null;
  }, []);

  const applyRetainedModelContent = useCallback((documentId: string, content: string) => {
    const model = retainedModel(documentId);
    if (model) applyUndoableModelContent(model, content);
  }, [retainedModel]);

  const runEditorHistory = useCallback(async (operation: "undo" | "redo") => {
    if (!activeDocument) return;
    const model = retainedModel(activeDocument.id) ?? (!diffReview ? editorRef.current?.getModel() : null);
    if (!model) {
      notify("この文書には現在のセッションで戻せる編集履歴がありません。");
      return;
    }
    const content = await runUndoableModelHistory(model, operation);
    if (content === null) {
      notify(operation === "undo" ? "元に戻せる編集履歴がありません。" : "やり直せる編集履歴がありません。");
      return;
    }
    setDocuments((current) => current.map((entry) => entry.id === activeDocument.id
      ? { ...entry, content, dirty: content !== entry.document?.content }
      : entry));
    setEditorHistoryRevision((current) => current + 1);
    if (diffReview) {
      setDiffReview(null);
      notify(operation === "undo" ? "直前の編集を元に戻しました。保存するまでは未保存状態です。" : "編集をやり直しました。", "success");
    } else {
      editorRef.current?.focus();
    }
  }, [activeDocument, diffReview, notify, retainedModel]);

  useEffect(() => {
    if (!diffReview) return;
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      event.stopPropagation();
      void runEditorHistory(event.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", handleHistoryShortcut, true);
    return () => window.removeEventListener("keydown", handleHistoryShortcut, true);
  }, [diffReview, runEditorHistory]);

  const prepareDiffReviewFiles = useCallback(async (changes: ApprovalFileChange[]): Promise<DiffReviewFile[]> => {
    if (!workspace) throw new Error("差分を表示するワークスペースがありません。");
    return Promise.all(changes.map(async (change) => {
      const kind = changeKindValue(change.kind);
      if (kind === "add") return makeDiffReviewFile(change, "");
      try {
        const disk = await api.readDocument(workspace.root, change.path);
        return makeDiffReviewFile(change, disk.content);
      } catch (error) {
        return {
          ...makeDiffReviewFile(change, ""),
          error: `変更前ファイルを読み取れませんでした: ${errorMessage(error)}`,
        };
      }
    }));
  }, [workspace]);

  const probeCodexCompatibility = useCallback(async (force = false): Promise<CodexCompatibilityReport | null> => {
    if (!isTauri()) return null;
    if (codexProbeBusyRef.current) return codexCompatibilityRef.current;
    if (!force && codexCompatibilityRef.current) return codexCompatibilityRef.current;
    codexProbeBusyRef.current = true;
    setCodexProbeBusy(true);
    try {
      const report = await api.codexCompatibilityProbe(force);
      codexCompatibilityRef.current = report;
      setCodexCompatibility(report);
      return report;
    } catch (error) {
      notify(`Codex互換性を確認できませんでした: ${errorMessage(error)}`, "error");
      return null;
    } finally {
      codexProbeBusyRef.current = false;
      setCodexProbeBusy(false);
    }
  }, [notify]);

  const inspectPhitsAgentSetup = useCallback(async (root?: string) => {
    if (!isTauri() || !root) {
      setPhitsAgentSetup(null);
      return;
    }
    try {
      setPhitsAgentSetup(await api.inspectPhitsAgentSetup(root));
    } catch (error) {
      setPhitsAgentSetup(null);
      notify(`PHITS用Codex設定を検査できませんでした: ${errorMessage(error)}`, "info");
    }
  }, [notify]);

  const updateDiagnostics = useCallback(async (root?: string) => {
    if (!isTauri()) return;
    diagnosticsRequestCountRef.current += 1;
    setDiagnosticsBusy(true);
    try {
      await inspectPhitsAgentSetup(root);
      const result = await api.diagnostics(root);
      setDiagnostics(result);
      if (result.languageSpec) {
        try {
          const rawSpec = await api.loadLanguageSpec(result.phitsRoot ?? undefined);
          languageSpecRef.current = rawSpec;
          if (monacoRef.current) {
            languageDisposeRef.current?.dispose();
            languageDisposeRef.current = registerPhitsLanguage(monacoRef.current, rawSpec);
          }
        } catch (error) {
          notify(`PHITS言語仕様を読み込めないため基本補完を使用します: ${errorMessage(error)}`, "info");
        }
      }
    }
    catch (error) { notify(`実行環境を診断できませんでした: ${errorMessage(error)}`, "error"); }
    finally {
      diagnosticsRequestCountRef.current = Math.max(0, diagnosticsRequestCountRef.current - 1);
      if (diagnosticsRequestCountRef.current === 0) setDiagnosticsBusy(false);
    }
  }, [inspectPhitsAgentSetup, notify]);

  const startQueuedDiagnosticsTurns = useCallback(() => {
    const motion = diagnosticsMotionRef.current;
    const runNext = () => {
      if (motion.queuedTurns < 1 || !diagnosticsRotorRef.current) {
        motion.spinning = false;
        motion.rapidMode = false;
        motion.rapidStartedAt = 0;
        motion.lastClickAt = 0;
        motion.rapidClicks = 0;
        motion.queuedTurns = 0;
        motion.queuedAnimation = null;
        setDiagnosticsQueuedTurns(0);
        return;
      }

      motion.spinning = true;
      setDiagnosticsQueuedTurns(motion.queuedTurns);
      const animation = diagnosticsRotorRef.current.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: diagnosticsTurnDuration(motion.queuedTurns), easing: "linear" },
      );
      motion.queuedAnimation = animation;
      animation.finished.then(() => {
        motion.queuedTurns = Math.max(0, motion.queuedTurns - 1);
        runNext();
      }).catch(() => undefined);
    };
    runNext();
  }, []);

  const handleDiagnosticsRefresh = useCallback(() => {
    if (!workspace) return;
    const motion = diagnosticsMotionRef.current;
    const now = performance.now();

    motion.pulseAnimation?.cancel();
    motion.pulseAnimation = diagnosticsPulseRef.current?.animate(
      [{ transform: "scale(1.15)" }, { transform: "scale(1)" }],
      { duration: 200, easing: "ease-out" },
    ) ?? null;
    motion.pulseAnimation?.finished.catch(() => undefined);

    if (motion.rapidMode) {
      motion.queuedTurns += 1;
      setDiagnosticsQueuedTurns(motion.queuedTurns);
      if (!motion.spinning) startQueuedDiagnosticsTurns();
      return;
    }

    if (!motion.lastClickAt || now - motion.lastClickAt > DIAGNOSTICS_RAPID_GAP_MS) {
      motion.rapidStartedAt = now;
      motion.rapidClicks = 1;
    } else {
      motion.rapidClicks += 1;
    }
    motion.lastClickAt = now;

    if (now - motion.rapidStartedAt >= DIAGNOSTICS_RAPID_THRESHOLD_MS) {
      motion.rapidMode = true;
      motion.normalAnimation?.cancel();
      motion.spinning = false;
      motion.queuedTurns = motion.rapidClicks;
      setDiagnosticsQueuedTurns(motion.queuedTurns);
      startQueuedDiagnosticsTurns();
      return;
    }

    if (shouldRequestDiagnostics(motion.rapidMode, diagnosticsRequestCountRef.current)) {
      void updateDiagnostics(workspace.root);
      void probeCodexCompatibility(true);
    }

    if (motion.spinning || !diagnosticsRotorRef.current) return;
    motion.spinning = true;
    const animation = diagnosticsRotorRef.current.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: DIAGNOSTICS_TURN_BASE_MS, easing: "linear" },
    );
    motion.normalAnimation = animation;
    animation.finished.then(() => {
      if (!motion.rapidMode) motion.spinning = false;
      motion.normalAnimation = null;
    }).catch(() => undefined);
  }, [probeCodexCompatibility, startQueuedDiagnosticsTurns, updateDiagnostics, workspace]);

  useEffect(() => () => {
    const motion = diagnosticsMotionRef.current;
    motion.normalAnimation?.cancel();
    motion.queuedAnimation?.cancel();
    motion.pulseAnimation?.cancel();
  }, []);

  const openSettings = useCallback(async (section: "appearance" | "phits") => {
    setSettingsSection(section);
    if (section !== "phits" || !isTauri()) return;
    try {
      const settings = await api.getPhitsSettings();
      setPhitsSettingsMode(settings.phitsRoot ? "custom" : "auto");
      setPhitsPathDraft(settings.phitsRoot ?? diagnostics?.phitsRoot ?? "");
    } catch (error) {
      notify(`PHITS実行環境の設定を読み込めませんでした: ${errorMessage(error)}`, "error");
    }
  }, [diagnostics?.phitsRoot, notify]);

  const browsePhitsRoot = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false, title: "PHITSインストールフォルダーを選択" });
    if (typeof selected !== "string") return;
    setPhitsSettingsMode("custom");
    setPhitsPathDraft(selected);
  }, []);

  const savePhitsSettings = useCallback(async () => {
    if (!isTauri()) return;
    if (phitsSettingsMode === "custom" && !phitsPathDraft.trim()) {
      notify("PHITSインストールフォルダーを指定してください。", "error");
      return;
    }
    setPhitsSettingsSaving(true);
    try {
      const saved = await api.setPhitsSettings(phitsSettingsMode === "custom" ? phitsPathDraft.trim() : null);
      setPhitsSettingsMode(saved.phitsRoot ? "custom" : "auto");
      if (saved.phitsRoot) setPhitsPathDraft(saved.phitsRoot);
      await updateDiagnostics(workspace?.root);
      notify(saved.phitsRoot ? "PHITSインストールフォルダーを保存しました。" : "PHITSパスを自動検出へ戻しました。", "success");
    } catch (error) {
      notify(`PHITS実行環境を保存できませんでした: ${errorMessage(error)}`, "error");
    } finally {
      setPhitsSettingsSaving(false);
    }
  }, [notify, phitsPathDraft, phitsSettingsMode, updateDiagnostics, workspace?.root]);

  const openDocument = useCallback(async (relativePath: string, targetWorkspace?: WorkspaceInfo | null) => {
    const resolvedWorkspace = targetWorkspace ?? workspaceRef.current;
    if (!resolvedWorkspace) return;
    const selectInput = () => {
      if (!isPhitsInputPath(relativePath)) return;
      if (workspaceRef.current && samePath(workspaceRef.current.root, resolvedWorkspace.root)) {
        workspaceRef.current = { ...workspaceRef.current, primaryInput: relativePath };
      }
      setWorkspace((current) => current && samePath(current.root, resolvedWorkspace.root)
        ? { ...current, primaryInput: relativePath }
        : current);
    };
    const existing = documentsRef.current.find((entry) => entry.document && samePath(entry.document.relativePath, relativePath));
    if (existing) { setActiveId(existing.id); selectInput(); return; }
    try {
      const document = await api.readDocument(resolvedWorkspace.root, relativePath);
      const next = { id: document.path, name: fileName(relativePath), document, content: document.content, dirty: false };
      setDocuments((current) => [...current, next]);
      setActiveId(next.id);
      selectInput();
    } catch (error) { notify(`${relativePath} を開けませんでした: ${errorMessage(error)}`, "error"); }
  }, [notify]);

  const activateDocument = useCallback((id: string) => {
    setActiveId(id);
    const relativePath = documentsRef.current.find((entry) => entry.id === id)?.document?.relativePath;
    if (!relativePath || !isPhitsInputPath(relativePath)) return;
    if (workspaceRef.current) workspaceRef.current = { ...workspaceRef.current, primaryInput: relativePath };
    setWorkspace((current) => current ? { ...current, primaryInput: relativePath } : current);
  }, []);

  const openWorkspaceAt = useCallback(async (
    root: string,
    options: OpenWorkspaceOptions = {},
  ): Promise<boolean> => {
    const currentWorkspace = workspaceRef.current;
    const switchingWorkspace = !currentWorkspace || !samePath(currentWorkspace.root, root);

    setBusy(true);
    try {
      let info: WorkspaceInfo;
      const preferredInput = options.preferredInput
        ?? (!switchingWorkspace ? currentWorkspace?.primaryInput ?? undefined : undefined);
      try {
        info = await api.openWorkspace(root, options.restoreRunState ?? true, preferredInput);
      } catch (error) {
        if (!preferredInput) throw error;
        info = await api.openWorkspace(root, options.restoreRunState ?? true);
        notify(`前回の実行対象 ${preferredInput} が見つからないため、ワークスペースだけを復元しました。`);
      }

      if (!switchingWorkspace) {
        workspaceRef.current = info;
        setWorkspace(info);
        const requested = options.preferredInput ?? options.activePath;
        if (requested) await openDocument(requested, info);
        return true;
      }

      try { await api.codexDisconnect(); } catch { /* local reset below is authoritative */ }
      setCodexConnected(false);
      setCodexBusy(false);
      setThreadId(null);
      setTurnId(null);
      setMessages([]);
      setApprovals([]);
      setSessionApprovalActive(false);
      setPhitsAgentSetup(null);
      setCodexConnectionError(null);
      for (const entry of documentsRef.current) retainedModel(entry.id)?.dispose();
      setOutput([]);
      setRunStatus(null);
      setDiffReview(null);
      setPendingReviewPaths(new Set());
      setConflictedPaths(new Set());
      setConflict(null);
      fileChangeBasesRef.current.clear();
      turnHistoryIdsRef.current.clear();

      const available = [...info.candidateInputs, ...info.auxiliaryFiles];
      const requestedPaths = options.openPaths?.length
        ? options.openPaths
        : [options.preferredInput ?? info.primaryInput ?? info.candidateInputs[0] ?? info.auxiliaryFiles[0]].filter((value): value is string => Boolean(value));
      const paths = [...new Set(requestedPaths
        .map((requested) => available.find((candidate) => samePath(candidate, requested)))
        .filter((value): value is string => Boolean(value)))];
      const opened: OpenDocument[] = [];
      for (const relativePath of paths) {
        try {
          const document = await api.readDocument(info.root, relativePath);
          opened.push({ id: document.path, name: fileName(relativePath), document, content: document.content, dirty: false });
        } catch (error) {
          notify(`${relativePath} を復元できませんでした: ${errorMessage(error)}`, "error");
        }
      }
      const desiredActive = options.preferredInput ?? options.activePath;
      const active = (desiredActive
        ? opened.find((entry) => entry.document && samePath(entry.document.relativePath, desiredActive))
        : undefined) ?? opened[0];
      const activeInput = options.preferredInput
        ?? (active?.document && isPhitsInputPath(active.document.relativePath) ? active.document.relativePath : info.primaryInput);
      info = { ...info, primaryInput: activeInput ?? null };
      workspaceRef.current = info;
      documentsRef.current = opened;
      setWorkspace(info);
      setDocuments(opened);
      setActiveId(active?.id ?? null);
      await updateDiagnostics(info.root);
      try {
        const groups = await api.listCodexChangeGroups(info.root);
        setPendingReviewPaths(new Set(groups.filter((group) => group.reviewState === "pendingReview").flatMap((group) => group.files)));
      } catch (error) {
        notify(`Codex変更の確認状態を読み込めませんでした: ${errorMessage(error)}`, "error");
      }
      if (info.candidateInputs.length > 1 && !info.primaryInput) {
        notify("実行する.inp/.phtをエクスプローラーで選択してください。");
      }
      return true;
    } catch (error) {
      notify(`ワークスペースを開けませんでした: ${errorMessage(error)}`, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [notify, openDocument, retainedModel, updateDiagnostics]);

  const requestWorkspaceOpen = useCallback(async (root: string, options: OpenWorkspaceOptions = {}): Promise<boolean> => {
    const currentWorkspace = workspaceRef.current;
    const switchingWorkspace = !currentWorkspace || !samePath(currentWorkspace.root, root);
    const dirtyDocumentIds = switchingWorkspace
      ? documentsRef.current.filter((entry) => entry.dirty).map((entry) => entry.id)
      : [];
    if (dirtyDocumentIds.length) {
      setWorkspaceSwitchPrompt({ root, options, documentIds: dirtyDocumentIds, busy: false });
      return false;
    }
    return openWorkspaceAt(root, options);
  }, [openWorkspaceAt]);

  const chooseWorkspace = useCallback(async () => {
    if (!isTauri()) { notify("フォルダー選択はデスクトップアプリで利用できます。"); return; }
    try {
      const selected = await open({ directory: true, multiple: false, title: "PHITSワークスペースを開く" });
      if (!selected || Array.isArray(selected)) return;
      await requestWorkspaceOpen(selected);
    } catch (error) { notify(`フォルダーを選択できませんでした: ${errorMessage(error)}`, "error"); }
  }, [notify, requestWorkspaceOpen]);

  const handleStartupOpenRequest = useCallback(async (request: StartupOpenRequest) => {
    if (handledStartupRequestsRef.current.has(request.id)) return;
    handledStartupRequestsRef.current.add(request.id);
    if (request.kind === "file" && request.relativePath) {
      await requestWorkspaceOpen(request.workspaceRoot, { preferredInput: request.relativePath });
    } else {
      await requestWorkspaceOpen(request.workspaceRoot);
    }
  }, [requestWorkspaceOpen]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlistenOpen: UnlistenFn | undefined;
    let unlistenDrop: UnlistenFn | undefined;
    void (async () => {
      unlistenOpen = await listen<StartupOpenRequest>("startup://open-request", (event) => {
        if (cancelled) return;
        void api.takeStartupOpenRequests().then(async (pending) => {
          if (!pending.length) await handleStartupOpenRequest(event.payload);
          for (const request of pending) await handleStartupOpenRequest(request);
        }).catch(() => handleStartupOpenRequest(event.payload));
      });
      unlistenDrop = await getCurrentWindow().onDragDropEvent((event) => {
        if (cancelled || event.payload.type !== "drop") return;
        const path = event.payload.paths[0];
        if (!path) return;
        void api.resolveStartupOpenTarget(path)
          .then(handleStartupOpenRequest)
          .catch((error) => notify(`ドロップした項目を開けませんでした: ${errorMessage(error)}`, "error"));
      });
      const pending = await api.takeStartupOpenRequests();
      for (const request of pending) {
        if (cancelled) return;
        await handleStartupOpenRequest(request);
      }
      if (!startupInitializedRef.current) {
        startupInitializedRef.current = true;
        if (!pending.length) {
          const previous = loadWorkspaceSession();
          if (previous) await openWorkspaceAt(previous.root, {
            preferredInput: previous.activeInputPath,
            openPaths: previous.openDocumentPaths,
            activePath: previous.activeDocumentPath,
          });
        }
      }
    })().catch((error) => notify(`起動時のファイルを開けませんでした: ${errorMessage(error)}`, "error"));
    return () => {
      cancelled = true;
      unlistenOpen?.();
      unlistenDrop?.();
    };
  }, [handleStartupOpenRequest, notify, openWorkspaceAt]);

  const newDocument = useCallback(() => {
    const index = documents.filter((entry) => entry.document === null).length + 1;
    const id = `untitled://${Date.now()}`;
    setDocuments((current) => [...current, { id, name: `無題-${index}.inp`, document: null, content: "[ Title ]\n\n[ Parameters ]\n\n[ End ]\n", dirty: true }]);
    setActiveId(id);
  }, [documents]);

  const saveDocumentAs = useCallback(async (entry = activeDocument): Promise<DocumentData | null> => {
    if (!workspace || !entry) return null;
    const target = await save({
      title: "名前を付けて保存",
      defaultPath: `${workspace.root}\\${entry.name}`,
      filters: [{ name: "PHITS・テキスト", extensions: ["inp", "pht", "txt", "out", "ang"] }],
    });
    if (!target) return null;
    const saved = await api.saveDocumentAs(workspace.root, target, entry.content, entry.document);
    setDocuments((current) => current.map((item) => item.id === entry.id
      ? { ...item, id: saved.path, name: fileName(saved.relativePath), document: saved, content: saved.content, dirty: false }
      : item));
    setActiveId(saved.path);
    if (isPhitsInputPath(saved.relativePath)) {
      const refreshed = await api.openWorkspace(workspace.root, false, saved.relativePath);
      workspaceRef.current = refreshed;
      setWorkspace(refreshed);
    }
    notify(`${fileName(saved.relativePath)} を保存しました。`, "success");
    return saved;
  }, [activeDocument, notify, workspace]);

  const saveDocumentBeforeTransition = useCallback(async (entry: OpenDocument): Promise<boolean> => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace) {
      notify("保存先を選ぶには、先にワークスペースを開いてください。", "error");
      return false;
    }
    if (entry.document && conflictedPaths.has(entry.document.relativePath)) {
      notify(`${entry.name} はCodexまたは外部変更との競合を解決するまで保存できません。`, "error");
      return false;
    }
    try {
      if (!entry.document) return Boolean(await saveDocumentAs(entry));
      const saved = await api.saveDocument(currentWorkspace.root, entry.document, entry.content);
      setDocuments((current) => current.map((item) => item.id === entry.id
        ? { ...item, id: saved.path, document: saved, content: saved.content, dirty: false }
        : item));
      notify(`${entry.name} を保存しました。`, "success");
      return true;
    } catch (error) {
      notify(`保存できませんでした: ${errorMessage(error)}`, "error");
      return false;
    }
  }, [conflictedPaths, notify, saveDocumentAs]);

  const saveDocument = useCallback(async () => {
    if (!workspace || !activeDocument) return;
    if (activeDocument.document && conflictedPaths.has(activeDocument.document.relativePath)) {
      notify("Codexまたは外部変更との競合を解決するまで、このファイルは保存できません。", "error");
      return;
    }
    try {
      setBusy(true);
      if (!activeDocument.document) {
        await saveDocumentAs(activeDocument);
        return;
      }
      const saved = await api.saveDocument(workspace.root, activeDocument.document, activeDocument.content);
      setDocuments((current) => current.map((entry) => entry.id === activeDocument.id ? { ...entry, id: saved.path, document: saved, content: saved.content, dirty: false } : entry));
      setActiveId(saved.path); notify(`${activeDocument.name} を保存しました。`, "success");
    } catch (error) { notify(`保存できませんでした: ${errorMessage(error)}`, "error"); }
    finally { setBusy(false); }
  }, [activeDocument, conflictedPaths, notify, saveDocumentAs, workspace]);

  const finalizeCloseDocument = useCallback((id: string) => {
    const index = documents.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    retainedModel(id)?.dispose();
    const next = documents.filter((entry) => entry.id !== id);
    setDocuments(next);
    if (id === activeId) setActiveId(next[Math.min(index, next.length - 1)]?.id ?? null);
  }, [activeId, documents, retainedModel]);

  const closeDocument = useCallback((id: string) => {
    const entry = documents.find((item) => item.id === id);
    if (!entry) return;
    if (entry.dirty) {
      setCloseDocumentPrompt({ documentId: id, busy: false });
      return;
    }
    finalizeCloseDocument(id);
  }, [documents, finalizeCloseDocument]);

  const completeCloseDocument = useCallback(async (saveBeforeClosing: boolean) => {
    if (!closeDocumentPrompt) return;
    const entry = documents.find((item) => item.id === closeDocumentPrompt.documentId);
    if (!entry) {
      setCloseDocumentPrompt(null);
      return;
    }
    if (!saveBeforeClosing) {
      setCloseDocumentPrompt(null);
      finalizeCloseDocument(entry.id);
      return;
    }
    setCloseDocumentPrompt((current) => current ? { ...current, busy: true } : current);
    if (!(await saveDocumentBeforeTransition(entry))) {
      setCloseDocumentPrompt((current) => current ? { ...current, busy: false } : current);
      return;
    }
    setCloseDocumentPrompt(null);
    finalizeCloseDocument(entry.id);
  }, [closeDocumentPrompt, documents, finalizeCloseDocument, saveDocumentBeforeTransition]);

  const completeWorkspaceSwitch = useCallback(async (saveBeforeSwitching: boolean) => {
    if (!workspaceSwitchPrompt) return;
    setWorkspaceSwitchPrompt((current) => current ? { ...current, busy: true } : current);
    if (saveBeforeSwitching) {
      for (const documentId of workspaceSwitchPrompt.documentIds) {
        const entry = documentsRef.current.find((item) => item.id === documentId);
        if (entry?.dirty && !(await saveDocumentBeforeTransition(entry))) {
          setWorkspaceSwitchPrompt((current) => current ? { ...current, busy: false } : current);
          return;
        }
      }
    }
    const { root, options } = workspaceSwitchPrompt;
    setWorkspaceSwitchPrompt(null);
    await openWorkspaceAt(root, options);
  }, [openWorkspaceAt, saveDocumentBeforeTransition, workspaceSwitchPrompt]);

  const completeApplicationClose = useCallback(async (saveBeforeClosing: boolean) => {
    if (!closeApplicationPrompt) return;
    const prompt = closeApplicationPrompt;
    setCloseApplicationPrompt((current) => current ? { ...current, busy: true } : current);
    if (saveBeforeClosing) {
      for (const documentId of closeApplicationPrompt.documentIds) {
        const entry = documentsRef.current.find((item) => item.id === documentId);
        if (entry?.dirty && !(await saveDocumentBeforeTransition(entry))) {
          setCloseApplicationPrompt((current) => current ? { ...current, busy: false } : current);
          return;
        }
      }
    }
    try {
      allowApplicationCloseRef.current = true;
      setCloseApplicationPrompt(null);
      await getCurrentWindow().destroy();
    } catch (error) {
      allowApplicationCloseRef.current = false;
      setCloseApplicationPrompt({ ...prompt, busy: false });
      notify(`アプリを終了できませんでした: ${errorMessage(error)}`, "error");
    }
  }, [closeApplicationPrompt, notify, saveDocumentBeforeTransition]);

  const runPhits = useCallback(async (production: boolean) => {
    if (!workspace) { notify("先にワークスペースを開いてください。"); return; }
    if (!workspace.primaryInput) {
      notify(workspace.candidateInputs.length
        ? "実行する.inp/.phtをエクスプローラーで選択してください。"
        : "ワークスペース直下に実行できる.inp/.phtがありません。", "error");
      return;
    }
    const warning = production
      ? `未保存内容を保存後、${workspace.primaryInput} と既存出力を記録します。Codexを停止してPHITSを起動し、Editorを直ちに終了します。続行しますか？`
      : hasDirtyDocuments ? `未保存の変更を保存して ${workspace.primaryInput} を通常実行しますか？` : `${workspace.primaryInput} を通常実行しますか？`;
    if (!window.confirm(warning)) return;
    try {
      setBusy(true);
      for (const entry of documents.filter((item) => item.dirty)) {
        if (!entry.document) {
          notify("未保存の新規文書があります。先に保存先を指定してください。", "error");
          return;
        }
        const saved = await api.saveDocument(workspace.root, entry.document, entry.content);
        setDocuments((current) => current.map((item) => item.id === entry.id
          ? { ...item, id: saved.path, document: saved, content: saved.content, dirty: false }
          : item));
      }
      setOutputCollapsed(false); appendOutput(`[Editor] ${production ? "本番" : "通常"}実行を要求しました。`);
      let overrideUnresolved = false;
      if (runStatus?.state === "unresolved") {
        overrideUnresolved = window.confirm("OS上でこのフォルダーのPHITSプロセスが停止していることを確認しましたか？ 確認済みの場合だけ状態不明を解除します。");
        if (!overrideUnresolved) return;
      }
      const status = await (production
        ? api.runProduction(workspace.root, workspace.primaryInput ?? undefined, overrideUnresolved)
        : api.runNormal(workspace.root, workspace.primaryInput ?? undefined, overrideUnresolved)) as RunStatus;
      setRunStatus(status); appendOutput(`[${status.state}] ${status.message}`);
    } catch (error) { appendOutput(`[failed] ${errorMessage(error)}`); notify(`PHITSを起動できませんでした: ${errorMessage(error)}`, "error"); }
    finally { setBusy(false); }
  }, [appendOutput, documents, hasDirtyDocuments, notify, runStatus?.state, workspace]);

  const runUtility = useCallback(async (kind: UtilityKind) => {
    if (!workspace || !activeDocument?.document) { notify("対象ファイルを開いて選択してください。"); return; }
    const labels: Record<UtilityKind, string> = { angel: "ANGEL", dchain: "DCHAIN", phig3d: "PHIG-3D" };
    if (!window.confirm(`${labels[kind]} で ${activeDocument.name} を開きますか？`)) return;
    try { await api.runUtility(workspace.root, kind, activeDocument.document.relativePath); notify(`${labels[kind]} を起動しました。`, "success"); }
    catch (error) { notify(`${labels[kind]} を起動できませんでした: ${errorMessage(error)}`, "error"); }
  }, [activeDocument, notify, workspace]);

  const connectCodex = useCallback(async () => {
    if (!workspace) { notify("Codexを接続するワークスペースを先に開いてください。"); return; }
    const compatibility = await probeCodexCompatibility();
    if (!codexFeatureAvailable(compatibility, "chat")) {
      const message = "Codex App Serverの会話機能に互換性がないため接続できません。実行環境の診断を確認してください。";
      setCodexConnectionError(message);
      notify(message, "error");
      return;
    }
    try {
      setCodexBusy(true);
      const connection = await api.codexConnect(workspace.root);
      const available = connection.models;
      const selected = available.find((entry) => entry.isDefault) ?? available[0];
      codexCompatibilityRef.current = connection.compatibility;
      setCodexCompatibility(connection.compatibility);
      setPhitsAgentSetup(connection.phitsAgentSetup);
      setCodexConnectionError(null);
      setModels(available); setThreadLinks(connection.threads); setModel(selected?.id ?? ""); setReasoning(selected?.defaultReasoningEffort ?? selected?.supportedReasoningEfforts[0] ?? ""); setCodexConnected(true);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", text: "Codex App Serverに接続しました。" }]);
    } catch (error) {
      const message = errorMessage(error);
      setCodexConnectionError(message);
      notify(`Codexに接続できませんでした: ${message}`, "error");
    }
    finally { setCodexBusy(false); }
  }, [notify, probeCodexCompatibility, workspace]);

  const disconnectCodex = useCallback(async () => {
    try { await api.codexDisconnect(); } catch { /* safe local disconnected state */ }
    setCodexConnected(false); setThreadId(null); setTurnId(null); setCodexBusy(false); setApprovals([]); setDiffReview(null); setCodexConnectionError(null); fileChangeBasesRef.current.clear(); turnHistoryIdsRef.current.clear(); setSessionApprovalActive(false);
  }, []);

  const startThread = useCallback(async () => {
    if (!workspace) return;
    if (!codexFeatureAvailable(codexCompatibility, "threads")) { notify("このCodex CLIではスレッド機能を利用できません。", "error"); return; }
    try { setCodexBusy(true); const id = await api.codexThreadStart(workspace.root, model || undefined, reasoning || undefined); setThreadId(id); setThreadLinks((current) => [{ threadId: id, title: "新しい会話", lastUsedAt: new Date().toISOString(), model, reasoningEffort: reasoning }, ...current.filter((item) => item.threadId !== id)]); setMessages([]); }
    catch (error) { notify(`スレッドを開始できませんでした: ${errorMessage(error)}`, "error"); }
    finally { setCodexBusy(false); }
  }, [codexCompatibility, model, notify, reasoning, workspace]);

  const resumeThread = useCallback(async (id: string) => {
    if (!workspace) return;
    if (!codexFeatureAvailable(codexCompatibility, "threads")) { notify("このCodex CLIではスレッド機能を利用できません。", "error"); return; }
    try { setCodexBusy(true); const history = await api.codexThreadResume(workspace.root, id); setThreadId(id); setMessages(historyMessages(history)); }
    catch (error) { notify(`スレッドを再開できませんでした: ${errorMessage(error)}`, "error"); }
    finally { setCodexBusy(false); }
  }, [codexCompatibility, notify, workspace]);

  const renameThread = useCallback(async (id: string, title: string) => {
    if (!workspace) return;
    if (!codexFeatureAvailable(codexCompatibility, "threads")) { notify("このCodex CLIではスレッド名を変更できません。", "error"); return; }
    try {
      await api.codexThreadRename(workspace.root, id, title);
      setThreadLinks((current) => current.map((item) => item.threadId === id ? { ...item, title, lastUsedAt: new Date().toISOString() } : item));
    } catch (error) { notify(`スレッド名を変更できませんでした: ${errorMessage(error)}`, "error"); }
  }, [codexCompatibility, notify, workspace]);

  const deleteThread = useCallback(async (id: string, title: string) => {
    if (!workspace) return;
    if (!codexFeatureAvailable(codexCompatibility, "threads")) { notify("このCodex CLIではスレッドを削除できません。", "error"); return; }
    if (!window.confirm(`「${title}」を完全に削除しますか？\nこの操作は元に戻せません。`)) return;
    try {
      await api.codexThreadDelete(workspace.root, id);
      setThreadLinks((current) => current.filter((item) => item.threadId !== id));
      if (threadId === id) { setThreadId(null); setTurnId(null); setMessages([]); }
    } catch (error) { notify(`スレッドを削除できませんでした: ${errorMessage(error)}`, "error"); }
  }, [codexCompatibility, notify, threadId, workspace]);

  const buildEditorContext = useCallback((entry: OpenDocument | null, dirtyOverride?: boolean): EditorContextV1 | null => {
    if (!entry && !workspace) return null;
    const markers = monacoRef.current && editorRef.current?.getModel()
      ? monacoRef.current.editor.getModelMarkers({ resource: editorRef.current.getModel()!.uri }).slice(0, 100).map((marker) => ({
        severity: marker.severity >= 8 ? "error" as const : marker.severity >= 4 ? "warning" as const : marker.severity >= 2 ? "info" as const : "hint" as const,
        message: marker.message, startLine: marker.startLineNumber, startColumn: marker.startColumn,
        endLine: marker.endLineNumber, endColumn: marker.endColumn,
      })) : [];
    const relativePath = entry?.document?.relativePath;
    const dirty = dirtyOverride ?? entry?.dirty ?? false;
    return boundedEditorContext({
      version: 1,
      activeDocumentPath: contextOptions.activeDocument ? relativePath : undefined,
      activeInputPath: workspace?.primaryInput ?? undefined,
      cursor: contextOptions.activeDocument ? cursor : undefined,
      selection: contextOptions.selection ? selection : undefined,
      dirty,
      dirtyBuffer: contextOptions.activeDocument && dirty ? entry?.content : undefined,
      openDocumentPaths: documents.flatMap((item) => item.document ? [item.document.relativePath] : []),
      ...(contextOptions.diagnostics && markers.length ? { diagnostics: markers } : {}),
      phitsVersion: diagnostics?.phitsVersion ?? undefined,
      attachedOutputPath: contextOptions.attachedOutput ? attachedOutput?.path : undefined,
      attachedOutputContent: contextOptions.attachedOutput ? attachedOutput?.content : undefined,
      documentRevisions: [...turnRevisionsRef.current.values()],
    });
  }, [attachedOutput, contextOptions, cursor, diagnostics?.phitsVersion, documents, selection, workspace]);

  const sendCodex = useCallback(async (text: string): Promise<boolean> => {
    if (!threadId) return false;
    let contextEntry = activeDocument;
    let forceReadOnly = approvalMode === "consultationOnly"
      || !codexFeatureAvailable(codexCompatibility, "fileEditing")
      || !codexFeatureAvailable(codexCompatibility, "approvals");
    if (activeDocument?.dirty && !forceReadOnly) {
      const saveBeforeSend = window.confirm("この未保存ファイルを保存し、Codexが編集できる状態で送信しますか？\n\nOK: 保存して送信 / キャンセル: 次の選択へ");
      if (saveBeforeSend) {
        try {
          const saved = activeDocument.document
            ? await api.saveDocument(workspace!.root, activeDocument.document, activeDocument.content)
            : await saveDocumentAs(activeDocument);
          if (!saved) return false;
          contextEntry = { ...activeDocument, id: saved.path, name: fileName(saved.relativePath), document: saved, content: saved.content, dirty: false };
          setDocuments((current) => current.map((item) => item.id === activeDocument!.id ? contextEntry! : item));
          setActiveId(saved.path);
        } catch (error) { notify(`送信前に保存できませんでした: ${errorMessage(error)}`, "error"); return false; }
      } else if (window.confirm("保存せず、相談のみ（読み取り専用）で送信しますか？\n\nキャンセルすると送信しません。")) {
        forceReadOnly = true;
      } else return false;
    }
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, text };
    const assistantMessage = { id: crypto.randomUUID(), role: "assistant" as const, text: "", streaming: true };
    turnRevisionsRef.current.clear();
    turnDocumentBasesRef.current.clear();
    turnDiffFilesRef.current.clear();
    turnHistoryIdsRef.current.clear();
    fileChangeBasesRef.current.clear();
    activeTurnIdRef.current = null;
    setDiffReview(null);
    for (const entry of documentsRef.current) {
      if (entry.document && !entry.dirty) turnDocumentBasesRef.current.set(entry.document.relativePath, entry.content);
    }
    if (contextEntry?.document) turnDocumentBasesRef.current.set(contextEntry.document.relativePath, contextEntry.content);
    setMessages((current) => [...current, userMessage, assistantMessage]); setCodexBusy(true);
    try {
      if (contextEntry?.document) {
        turnRevisionsRef.current.set(contextEntry.document.relativePath, {
          relativePath: contextEntry.document.relativePath,
          diskSha256: await sha256Text(contextEntry.document.content),
          bufferSha256: await sha256Text(contextEntry.content),
          modifiedAtMs: contextEntry.document.modifiedAtMs,
          dirty: contextEntry.dirty,
        });
      }
      const response = await api.codexTurnStart(threadId, text, buildEditorContext(contextEntry, contextEntry?.dirty), approvalMode, model || undefined, reasoning || undefined, forceReadOnly) as unknown;
      setContextOptions(defaultContextOptions());
      setAttachedOutput(null);
      const now = new Date().toISOString();
      setThreadLinks((current) => current.map((item) => item.threadId === threadId ? { ...item, title: item.title === "新しい会話" ? text.trim().replace(/\s+/g, " ").slice(0, 36) : item.title, lastUsedAt: now, model, reasoningEffort: reasoning } : item));
      if (typeof response === "object" && response !== null) {
        const record = response as Record<string, unknown>;
        const turn = record.turn;
        const responseTurnId = typeof record.turnId === "string" ? record.turnId
          : typeof record.id === "string" ? record.id
            : typeof turn === "object" && turn !== null && typeof (turn as Record<string, unknown>).id === "string" ? (turn as Record<string, unknown>).id as string
              : null;
        if (responseTurnId) { activeTurnIdRef.current = responseTurnId; setTurnId(responseTurnId); }
      }
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantMessage.id ? { ...message, text: `送信エラー: ${errorMessage(error)}`, streaming: false } : message)); setCodexBusy(false);
      return false;
    }
    return true;
  }, [activeDocument, approvalMode, buildEditorContext, codexCompatibility, model, notify, reasoning, saveDocumentAs, threadId, workspace]);

  const interruptCodex = useCallback(async () => {
    if (!threadId || !turnId) { notify("CodexのターンIDを待っています。もう一度中断してください。"); return; }
    try { await api.codexTurnInterrupt(threadId, turnId); } catch (error) { notify(`中断できませんでした: ${errorMessage(error)}`, "error"); }
  }, [notify, threadId, turnId]);

  const resolveApproval = useCallback(async (decision: ApprovalDecision) => {
    const approval = approvals[0];
    if (!approval) return;
    const requestKey = approvalRequestKey(approval);
    const isAccepted = decision === "accept" || decision === "acceptForSession" || decision === "acceptWithExecPolicyAmendment";
    if (isAccepted) setDiffReview((current) => current?.requestKey === requestKey ? { ...current, status: "resolving" } : current);
    try {
      await api.resolveApproval(approval, decision);
      if (decision === "acceptForSession") setSessionApprovalActive(true);
      if (decision === "cancel") setCodexBusy(false);
      setApprovals((current) => current.filter((entry) => approvalRequestKey(entry) !== requestKey));
      if (!isAccepted) setDiffReview((current) => current?.requestKey === requestKey ? null : current);
    }
    catch (error) {
      if (isAccepted) setDiffReview((current) => current?.requestKey === requestKey ? { ...current, status: "awaitingApproval" } : current);
      notify(`承認結果を送信できませんでした: ${errorMessage(error)}`, "error");
    }
  }, [approvals, notify]);

  const selectedModel = models.find((entry) => entry.id === model);
  useEffect(() => {
    if (selectedModel && !selectedModel.supportedReasoningEfforts.includes(reasoning)) setReasoning(selectedModel.defaultReasoningEffort ?? selectedModel.supportedReasoningEfforts[0] ?? "");
  }, [reasoning, selectedModel]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;
    const attach = async <T,>(names: readonly string[], handler: (payload: T) => void) => {
      for (const name of names) {
        const unlisten = await listen<T>(name, (event) => handler(event.payload));
        if (cancelled) unlisten(); else unlisteners.push(unlisten);
      }
    };
    void attach<unknown>(EVENT_NAMES.output, (payload) => appendOutput(payloadText(payload) || JSON.stringify(payload)));
    void attach<RunStatus>(EVENT_NAMES.run, (payload) => { setRunStatus(payload); appendOutput(`[${payload.state}] ${payload.message}`); });
    void attach<unknown>(EVENT_NAMES.approval, (payload) => {
      const approval = normalizeApprovalRequest(payload);
      if (!approval) {
        notify("Codexから解釈できない承認要求を受信したため、自動実行せず無視しました。", "error");
        return;
      }
      void (async () => {
        if (approval.kind === "fileChange" && workspace) {
          for (const change of approval.changes) {
            const revision = turnRevisionsRef.current.get(change.path);
            const openEntry = documentsRef.current.find((item) => item.document?.relativePath === change.path);
            if (revision && openEntry?.document) {
              const disk = await api.readDocument(workspace.root, change.path);
              const diskHash = await sha256Text(disk.content);
              const bufferHash = await sha256Text(openEntry.content);
              if (hasDocumentRevisionConflict(revision, diskHash, bufferHash, disk.modifiedAtMs)) {
                setConflictedPaths((current) => new Set(current).add(change.path));
                setConflict({ path: change.path, disk, entryId: openEntry.id });
                await api.resolveApproval(approval, "decline");
                notify(`${change.path} はターン開始後に変更されたため、Codexの変更を承認せず競合状態にしました。`, "error");
                return;
              }
            }
          }
        }
        if (approval.kind === "fileChange" && approval.changes.length) {
          const requestKey = approvalRequestKey(approval);
          const prepared = approval.itemId ? fileChangeBasesRef.current.get(approval.itemId) : undefined;
          const files = await (prepared ?? prepareDiffReviewFiles(approval.changes));
          setDiffReview({ mode: "operationApproval", requestKey, itemId: approval.itemId, files, selectedFileIndex: 0, status: "awaitingApproval" });
          const entry = documentsRef.current.find((item) => item.document?.relativePath === files[0]?.path);
          if (entry) setActiveId(entry.id);
        }
        setApprovals((current) => current.some((entry) => approvalRequestKey(entry) === approvalRequestKey(approval)) ? current : [...current, approval]);
      })().catch((error) => notify(`承認前の競合確認に失敗しました: ${errorMessage(error)}`, "error"));
    });
    void attach<ApprovalResolvedEvent>(EVENT_NAMES.approvalResolved, (payload) => {
      setApprovals((current) => current.filter((entry) => !sameRequestId(entry.requestId, payload.requestId)));
    });
    void attach<RuntimeDiagnostics>(EVENT_NAMES.diagnostics, setDiagnostics);
    void attach<string>(EVENT_NAMES.codexLog, (line) => setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", text: stripAnsi(line) }]));
    void attach<unknown>(EVENT_NAMES.codexDisconnected, () => { setCodexConnected(false); setCodexBusy(false); setTurnId(null); setApprovals([]); setDiffReview(null); fileChangeBasesRef.current.clear(); turnDocumentBasesRef.current.clear(); turnDiffFilesRef.current.clear(); turnHistoryIdsRef.current.clear(); activeTurnIdRef.current = null; setSessionApprovalActive(false); });
    void attach<CodexFileChangeEvent>(EVENT_NAMES.codexFileChange, (event) => {
      if (!workspace) return;
      if (event.phase === "started") {
        if (event.itemId) fileChangeBasesRef.current.set(event.itemId, prepareDiffReviewFiles(event.changes));
        return;
      }
      if (event.phase !== "completed") return;
      const turnKey = event.turnId ?? activeTurnIdRef.current ?? event.threadId ?? "current-turn";
      const prepared = event.itemId ? fileChangeBasesRef.current.get(event.itemId) : undefined;
      if (event.itemId) fileChangeBasesRef.current.delete(event.itemId);
      const completed = event.status?.toLowerCase() === "completed";
      if (!completed) {
        setDiffReview((current) => current?.itemId === event.itemId ? null : current);
        return;
      }
      for (const change of event.changes) {
        const kind = changeKindValue(change.kind);
        const reloadPath = movePathValue(change.kind) ?? change.path;
        const entry = documentsRef.current.find((item) => item.document?.relativePath === change.path);
        if (!entry) continue;
        if (entry.dirty) {
          setConflictedPaths((current) => new Set(current).add(change.path));
          notify(`${change.path} は編集中にCodex側で変更されたため競合しています。保存を停止しました。`, "error");
          void api.readDocument(workspace.root, reloadPath).then((disk) => setConflict({ path: change.path, disk, entryId: entry.id })).catch(() => undefined);
          continue;
        }
        if (kind === "delete") {
          setDocuments((current) => current.filter((item) => item.id !== entry.id));
          setActiveId((current) => current === entry.id ? null : current);
          setConflictedPaths((current) => { const next = new Set(current); next.delete(change.path); return next; });
          continue;
        }
        void api.readDocument(workspace.root, reloadPath).then((reloaded) => {
          applyRetainedModelContent(entry.id, reloaded.content);
          setDocuments((current) => current.map((item) => item.id === entry.id ? { ...item, id: reloaded.path, document: reloaded, content: reloaded.content, dirty: false } : item));
          setConflictedPaths((current) => { const next = new Set(current); next.delete(change.path); return next; });
        }).catch((error) => notify(`Codex変更後の再読込に失敗しました: ${errorMessage(error)}`, "error"));
      }
      // Codexによるファイル一覧の変化だけを反映する。ここでPHITSの前回状態を
      // 再通知すると、Codex完了直後にPHITS完了メッセージが誤表示されてしまう。
      void api.openWorkspace(workspace.root, false, workspace.primaryInput ?? undefined).then((info) => {
        workspaceRef.current = info;
        setWorkspace(info);
      }).catch(() => undefined);
      void (async () => {
        const historyId = event.historyId;
        const historyIds = historyId
          ? [...(turnHistoryIdsRef.current.get(turnKey) ?? []), historyId]
          : turnHistoryIdsRef.current.get(turnKey) ?? [];
        turnHistoryIdsRef.current.set(turnKey, historyIds);
        const files = await (prepared ?? prepareDiffReviewFiles(event.changes));
        const appliedFiles = await Promise.all(files.map(async (file) => {
          try {
            const disk = await api.readDocument(workspace.root, file.movedTo ?? file.path);
            return { ...file, original: turnDocumentBasesRef.current.get(file.path) ?? file.original, modified: disk.content, error: undefined };
          } catch {
            return file.kind === "delete" ? { ...file, modified: "", error: undefined } : file;
          }
        }));
        const accumulatedFiles = mergeAppliedDiffReviewFiles(turnDiffFilesRef.current.get(turnKey) ?? [], appliedFiles);
        turnDiffFilesRef.current.set(turnKey, accumulatedFiles);
        setPendingReviewPaths((current) => {
          const next = new Set(current);
          for (const file of accumulatedFiles) next.add(file.movedTo ?? file.path);
          return next;
        });
        setDiffReview({ mode: "completedChange", groupId: `turn:${turnKey}`, itemId: event.itemId, files: accumulatedFiles, selectedFileIndex: 0, status: "pendingReview", historyIds });
      })().catch((error) => notify(`適用後の差分表示を準備できませんでした: ${errorMessage(error)}`, "error"));
    });
    void attach<CodexEvent>(EVENT_NAMES.codex, (event) => {
      const method = event.method.toLowerCase();
      const text = method === "item/agentmessage/delta" ? payloadText(event.params) : "";
      if (method === "thread/name/updated" && typeof event.params === "object" && event.params !== null) {
        const params = event.params as Record<string, unknown>;
        if (typeof params.threadId === "string" && typeof params.threadName === "string") {
          setThreadLinks((current) => current.map((link) => link.threadId === params.threadId ? { ...link, title: params.threadName as string, lastUsedAt: new Date().toISOString() } : link));
        }
      }
      const turnStarted = isCodexTurnStarted(method), turnCompleted = isCodexTurnCompleted(method);
      if (turnStarted) {
        const id = codexTurnId(event.params);
        if (id) { activeTurnIdRef.current = id; setTurnId(id); }
        setCodexBusy(true);
      }
      if (text) setMessages((current) => {
        let lastIndex = -1;
        for (let index = current.length - 1; index >= 0; index -= 1) {
          if (current[index].role === "assistant" && current[index].streaming) { lastIndex = index; break; }
        }
        if (lastIndex < 0) return [...current, { id: crypto.randomUUID(), role: "assistant", text, streaming: !turnCompleted }];
        return current.map((message, index) => index === lastIndex ? { ...message, text: message.text + text, streaming: !turnCompleted } : message);
      });
      if (turnCompleted) {
        const completedTurnId = codexTurnId(event.params);
        setCodexBusy(false); setTurnId(null); setApprovals((current) => completedTurnId ? current.filter((entry) => entry.turnId !== completedTurnId) : current); setMessages((current) => current.map((message) => message.streaming ? { ...message, streaming: false } : message));
        appendOutput("[completed] 前回のCodex実行は完了しています。");
      }
    });
    void updateDiagnostics();
    void probeCodexCompatibility();
    return () => { cancelled = true; unlisteners.forEach((unlisten) => unlisten()); };
  }, [appendOutput, applyRetainedModelContent, notify, prepareDiffReviewFiles, probeCodexCompatibility, updateDiagnostics, workspace]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); void saveDocument(); }
      if (event.key.toLowerCase() === "o") { event.preventDefault(); void chooseWorkspace(); }
      if (event.key.toLowerCase() === "n") { event.preventDefault(); newDocument(); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [chooseWorkspace, newDocument, saveDocument]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: UnlistenFn | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      if (allowApplicationCloseRef.current) return;
      const dirtyDocumentIds = documentsRef.current.filter((entry) => entry.dirty).map((entry) => entry.id);
      if (!dirtyDocumentIds.length) return;
      event.preventDefault();
      setCloseDocumentPrompt(null);
      setWorkspaceSwitchPrompt(null);
      setCloseApplicationPrompt({ documentIds: dirtyDocumentIds, busy: false });
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (hasDirtyDocuments && !allowApplicationCloseRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirtyDocuments]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) closeTopMenus(menuBarRef.current);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTopMenus(menuBarRef.current);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco;
    languageDisposeRef.current?.dispose(); languageDisposeRef.current = registerPhitsLanguage(monaco, languageSpecRef.current);
    monaco.editor.defineTheme("phits-light", { base: "vs", inherit: true, rules: [
      { token: "type.identifier", foreground: "075F96", fontStyle: "bold" }, { token: "attribute.name", foreground: "7B3F00" }, { token: "comment", foreground: "73808C", fontStyle: "italic" },
    ], colors: {
      "editor.background": "#FDFDFD",
      "editor.lineHighlightBackground": "#F2F2F2",
      "editor.selectionBackground": "#D0D0D0AA",
      "editorLineNumber.foreground": "#8A8A8A",
      "editorLineNumber.activeForeground": "#555555",
      "editorGutter.background": "#FDFDFD",
    } });
  }, []);

  const queueCodexDraft = useCallback((text: string) => {
    setCodexOpen(true);
    setDraftRequest({ id: Date.now(), text });
  }, []);

  const onEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    setEditorHistoryRevision((current) => current + 1);
    editor.onDidChangeModelContent(() => setEditorHistoryRevision((current) => current + 1));
    editor.onDidChangeCursorPosition(({ position }) => setCursor({ line: position.lineNumber, column: position.column }));
    editor.onDidChangeCursorSelection(({ selection: range }) => {
      const text = editor.getModel()?.getValueInRange(range) ?? "";
      setSelection(text ? { startLine: range.startLineNumber, startColumn: range.startColumn, endLine: range.endLineNumber, endColumn: range.endColumn, text } : undefined);
    });
    const actions = [
      ["codex.explainSelection", "Codex: 選択範囲を説明", "選択範囲を説明してください。"],
      ["codex.fixSelection", "Codex: 選択範囲を修正", "選択範囲の問題を修正してください。"],
      ["codex.reviewFile", "Codex: 現在のファイルをレビュー", "現在のファイルをレビューしてください。"],
      ["codex.addComment", "Codex: コメントを追加", "選択範囲に分かりやすいコメントを追加してください。"],
    ];
    for (const [id, label, prompt] of actions) editor.addAction({ id, label, contextMenuGroupId: "9_codex", run: () => queueCodexDraft(prompt) });
    editor.addAction({ id: "codex.addContext", label: "Codexコンテキストへ追加", contextMenuGroupId: "9_codex", run: () => { setContextOptions((current) => ({ ...current, activeDocument: true, selection: true })); setCodexOpen(true); } });
    editor.focus();
  }, [queueCodexDraft]);

  const editorOptions = useMemo<MonacoEditor.IStandaloneEditorConstructionOptions>(() => ({
    automaticLayout: true, fontFamily: '"Cascadia Mono", "Consolas", monospace', fontSize: editorFontSize, lineHeight: Math.round(editorFontSize * 1.55),
    minimap: { enabled: true, scale: 0.8 }, scrollBeyondLastLine: false, smoothScrolling: true, wordWrap: "on", wrappingIndent: "indent",
    colorDecorators: false,
    stickyScroll: { enabled: true, maxLineCount: 1 },
    renderWhitespace: "selection", padding: { top: 12, bottom: 16 }, bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true },
    quickSuggestions: { other: true, comments: false, strings: false },
  }), [editorFontSize]);

  const startVerticalResize = useCallback((event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId); const startX = event.clientX, startWidth = codexWidth, width = viewportWidth;
    const move = (e: PointerEvent) => {
      const maximum = width * MAX_CODEX_PANEL_RATIO;
      const nextWidth = Math.min(maximum, Math.max(Math.min(MIN_CODEX_PANEL_WIDTH, maximum), startWidth + startX - e.clientX));
      setCodexPanelRatio(normalizeCodexPanelRatio(width > 0 ? nextWidth / width : DEFAULT_CODEX_PANEL_RATIO));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, [codexWidth, viewportWidth]);

  const startHorizontalResize = useCallback((event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId); const startY = event.clientY, startHeight = outputHeight;
    const move = (e: PointerEvent) => setOutputHeight(Math.max(110, Math.min(480, startHeight + startY - e.clientY)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, [outputHeight]);

  const allFiles = workspace ? Array.from(new Set([...workspace.candidateInputs, ...workspace.auxiliaryFiles])) : [];
  const currentApproval = approvals[0] ?? null;
  const currentApprovalKey = currentApproval ? approvalRequestKey(currentApproval) : undefined;
  const currentReviewMatches = !!diffReview && diffReview.requestKey === currentApprovalKey;
  const approvalCanAccept = currentApproval?.kind !== "fileChange"
    || (currentReviewMatches && !diffReview.files.some((file) => file.error));
  const contextChips = [
    contextOptions.activeDocument && activeDocument?.document ? { id: "activeDocument", label: `現在: ${activeDocument.document.relativePath}` } : null,
    contextOptions.selection && selection ? { id: "selection", label: `選択: ${selection.startLine}–${selection.endLine}行` } : null,
    contextOptions.attachedOutput && attachedOutput ? { id: "attachedOutput", label: `出力: ${attachedOutput.path}` } : null,
    buildEditorContext(activeDocument)?.contentWarning ? { id: "warning", label: buildEditorContext(activeDocument)!.contentWarning!, warning: true } : null,
  ].filter((chip): chip is { id: string; label: string; warning?: boolean } => chip !== null);

  const removeContext = (id: string) => {
    if (id === "attachedOutput") setAttachedOutput(null);
    if (id !== "warning") setContextOptions((current) => ({ ...current, [id]: false }));
  };

  const analyzeOutput = useCallback(async (relativePath: string) => {
    if (!workspace) return;
    try {
      const document = await api.readDocument(workspace.root, relativePath);
      setAttachedOutput({ path: relativePath, content: document.content });
      setContextOptions((current) => ({ ...current, attachedOutput: true }));
      queueCodexDraft(`PHITS出力 ${relativePath} を解析し、重要な結果・警告・異常終了の有無を説明してください。`);
    } catch (error) { notify(`出力を添付できませんでした: ${errorMessage(error)}`, "error"); }
  }, [notify, queueCodexDraft, workspace]);

  const showCodexHistoryPreview = useCallback((preview: CodexHistoryPreview, group?: CodexChangeGroupV1) => {
    const files: DiffReviewFile[] = preview.files.map((file) => ({
      path: file.path,
      movedTo: file.afterPath !== file.path ? file.afterPath : undefined,
      kind: file.kind,
      original: file.original,
      modified: file.modified,
      diff: "",
      hunkCount: file.original === file.modified ? 0 : 1,
    }));
    const status = preview.status === "reverted" ? "reverted" : preview.status === "pendingReview" ? "pendingReview" : "reviewed";
    setDiffReview({ mode: "history", groupId: group?.groupId ?? preview.historyId, files, selectedFileIndex: 0, status, historyIds: status !== "reverted" ? group?.historyIds : [] });
    const entry = documentsRef.current.find((item) => item.document?.relativePath === (files[0]?.movedTo ?? files[0]?.path));
    if (entry) setActiveId(entry.id);
  }, []);

  const refreshPendingReviewPaths = useCallback(async () => {
    if (!workspace) return;
    const groups = await api.listCodexChangeGroups(workspace.root);
    setPendingReviewPaths(new Set(groups.filter((group) => group.reviewState === "pendingReview").flatMap((group) => group.files)));
  }, [workspace]);

  const openLatestCodexHistory = useCallback(async () => {
    if (!workspace) return;
    try {
      const groups = await api.listCodexChangeGroups(workspace.root);
      const latest = groups.find((entry) => entry.reviewState === "pendingReview") ?? groups.find((entry) => entry.reviewState === "reviewed");
      if (!latest) {
        notify("確認できるCodex変更履歴はありません。");
        return;
      }
      showCodexHistoryPreview(await api.previewCodexChangeGroup(workspace.root, latest.historyIds), latest);
    } catch (error) {
      notify(`Codex変更履歴を開けませんでした: ${errorMessage(error)}`, "error");
    }
  }, [notify, showCodexHistoryPreview, workspace]);

  const keepCodexChanges = useCallback(async (): Promise<boolean> => {
    if (!diffReview?.historyIds?.length) return true;
    if (!workspace) return false;
    const review = diffReview;
    try {
      await api.markCodexChangeGroupReviewed(workspace.root, review.historyIds ?? []);
      await refreshPendingReviewPaths();
      setDiffReview((current) => current ? { ...current, status: "reviewed" } : current);
      notify("Codexの変更を保持しました。", "success");
      return true;
    } catch (error) {
      notify(`Codex変更を確認済みにできませんでした: ${errorMessage(error)}`, "error");
      return false;
    }
  }, [diffReview, notify, refreshPendingReviewPaths, workspace]);

  const confirmCodexHistoryRevert = useCallback(async (): Promise<boolean> => {
    if (!workspace || !diffReview?.historyIds?.length) return false;
    const review = diffReview;
    const historyIds = diffReview.historyIds ?? [];
    const dirtyPath = review.files.find((file) => documentsRef.current.some((entry) => entry.document?.relativePath === (file.movedTo ?? file.path) && entry.dirty));
    if (dirtyPath) {
      notify(`${dirtyPath.movedTo ?? dirtyPath.path} に未保存の編集があるため、Codex変更を元に戻せません。`, "error");
      return false;
    }
    setDiffReview((current) => current ? { ...current, status: "reverting" } : current);
    try {
      await api.revertCodexChangeGroup(workspace.root, historyIds);
      const restored = await Promise.all(review.files.map(async (file) => {
        try {
          return { file, document: await api.readDocument(workspace.root, file.path) };
        } catch {
          return { file, document: null };
        }
      }));
      setDocuments((current) => {
        let next = [...current];
        for (const result of restored) {
          const index = next.findIndex((entry) => {
            const relative = entry.document?.relativePath;
            return relative === result.file.path || relative === result.file.movedTo;
          });
          if (!result.document) {
            if (index >= 0) {
              retainedModel(next[index].id)?.dispose();
              next.splice(index, 1);
            }
            continue;
          }
          if (index >= 0) {
            const previousId = next[index].id;
            applyRetainedModelContent(previousId, result.document.content);
            next[index] = { ...next[index], id: result.document.path, name: fileName(result.document.relativePath), document: result.document, content: result.document.content, dirty: false };
            if (activeIdRef.current === previousId) setActiveId(result.document.path);
          } else {
            next.push({ id: result.document.path, name: fileName(result.document.relativePath), document: result.document, content: result.document.content, dirty: false });
          }
        }
        return next;
      });
      await refreshPendingReviewPaths();
      setDiffReview({ ...review, status: "reverted", historyIds: [] });
      const refreshed = await api.openWorkspace(workspace.root, false, workspace.primaryInput ?? undefined);
      workspaceRef.current = refreshed;
      setWorkspace(refreshed);
      notify("Codexの変更を元に戻しました。変更前の原バイトを復元しています。", "success");
      return true;
    } catch (error) {
      setDiffReview((current) => current ? { ...current, status: "pendingReview" } : current);
      notify(`Codexの変更を元に戻せませんでした: ${errorMessage(error)}`, "error");
      return false;
    }
  }, [applyRetainedModelContent, diffReview, notify, refreshPendingReviewPaths, retainedModel, workspace]);

  const finalizeCodexReview = useCallback(async (choice: CompletedChangeChoice) => {
    const completed = choice === "revert"
      ? await confirmCodexHistoryRevert()
      : await keepCodexChanges();
    if (completed) setDiffReview(null);
  }, [confirmCodexHistoryRevert, keepCodexChanges]);

  const { canUndoEditor, canRedoEditor } = useMemo(() => {
    const model = activeDocument
      ? retainedModel(activeDocument.id) ?? (!diffReview ? editorRef.current?.getModel() : null)
      : null;
    const undoableModel = model ? asUndoableTextModel(model) : null;
    return {
      canUndoEditor: undoableModel?.canUndo() ?? false,
      canRedoEditor: undoableModel?.canRedo() ?? false,
    };
  }, [activeDocument, diffReview, editorHistoryRevision, retainedModel]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="title-row"><strong>PHITS AI Editor</strong><span className="alpha-badge">ALPHA</span></div>
        <nav className="menu-bar" aria-label="メインメニュー" ref={menuBarRef} onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".menu-popover > button") && !target.closest(".menu-settings")) closeTopMenus(menuBarRef.current);
        }}>
          <details onToggle={(event) => { if (event.currentTarget.open) closeTopMenus(menuBarRef.current, event.currentTarget); }}><summary>ファイル</summary><div className="menu-popover"><button onClick={newDocument}>新規ファイル <kbd>Ctrl+N</kbd></button><button onClick={chooseWorkspace}>ワークスペースを開く… <kbd>Ctrl+O</kbd></button><hr/><button onClick={saveDocument} disabled={!activeDocument}>保存 <kbd>Ctrl+S</kbd></button><button onClick={() => void saveDocumentAs()} disabled={!activeDocument}>名前を付けて保存…</button></div></details>
          <details onToggle={(event) => { if (event.currentTarget.open) closeTopMenus(menuBarRef.current, event.currentTarget); }}><summary>編集</summary><div className="menu-popover"><button onClick={() => void runEditorHistory("undo")}>元に戻す <kbd>Ctrl+Z</kbd></button><button onClick={() => void runEditorHistory("redo")}>やり直し <kbd>Ctrl+Shift+Z</kbd></button><hr/><button onClick={() => void openLatestCodexHistory()} disabled={!workspace}>直前のCodex変更を確認…</button><hr/><button onClick={() => void editorRef.current?.getAction("actions.find")?.run()}>検索 <kbd>Ctrl+F</kbd></button><button onClick={() => void editorRef.current?.getAction("editor.action.startFindReplaceAction")?.run()}>置換 <kbd>Ctrl+H</kbd></button></div></details>
          <details onToggle={(event) => { if (event.currentTarget.open) closeTopMenus(menuBarRef.current, event.currentTarget); }}><summary>実行</summary><div className="menu-popover"><button onClick={() => runPhits(false)}>PHITS 通常実行</button><button onClick={() => runPhits(true)}>PHITS 本番実行…</button><hr/><button onClick={() => runUtility("angel")}>ANGEL</button><button onClick={() => runUtility("dchain")}>DCHAIN</button><button onClick={() => runUtility("phig3d")}>PHIG-3D</button></div></details>
          <details onToggle={(event) => { if (event.currentTarget.open) closeTopMenus(menuBarRef.current, event.currentTarget); }}><summary>表示</summary><div className="menu-popover menu-view" role="menu">
            <button className="menu-check-item" role="menuitemcheckbox" aria-checked={sidebarOpen} onClick={() => setSidebarOpen((value) => !value)}><span className="menu-checkmark" aria-hidden="true">{sidebarOpen ? "☑" : "☐"}</span><span>エクスプローラー</span></button>
            <button className="menu-check-item" role="menuitemcheckbox" aria-checked={codexOpen} onClick={() => setCodexOpen((value) => !value)}><span className="menu-checkmark" aria-hidden="true">{codexOpen ? "☑" : "☐"}</span><span>Codexパネル</span></button>
            <button className="menu-check-item" role="menuitemcheckbox" aria-checked={!outputCollapsed} onClick={() => setOutputCollapsed((value) => !value)}><span className="menu-checkmark" aria-hidden="true">{!outputCollapsed ? "☑" : "☐"}</span><span>出力パネル</span></button>
          </div></details>
          <details onToggle={(event) => { if (event.currentTarget.open) closeTopMenus(menuBarRef.current, event.currentTarget); }}><summary>設定</summary><div className="menu-popover settings-menu">
            <button aria-label="表示・フォント設定を開く" onClick={() => void openSettings("appearance")}><span>表示・フォント…</span><small>文字サイズを調整</small></button>
            <button aria-label="PHITS実行環境設定を開く" onClick={() => void openSettings("phits")}><span>PHITS実行環境…</span><small>インストール先を設定</small></button>
          </div></details>
          <details onToggle={(event) => { if (event.currentTarget.open) closeTopMenus(menuBarRef.current, event.currentTarget); }}><summary>ヘルプ</summary><div className="menu-popover menu-help"><p>PHITS 3.37 / Codex CLI 0.153.1<br/>Version {packageMetadata.version}</p></div></details>
        </nav>
      </header>

      <div className="toolbar" role="toolbar" aria-label="エディターツールバー">
        <div className="toolbar-group"><button className="tool-button" onClick={chooseWorkspace} title="ワークスペースを開く (Ctrl+O)"><Icon name="folder"/><span>開く</span></button><button className="tool-button" onClick={saveDocument} disabled={!activeDocument?.dirty} title="保存 (Ctrl+S)"><Icon name="save"/><span>保存</span></button><button className="tool-button history-button" onClick={() => void runEditorHistory("undo")} disabled={!canUndoEditor} title="元に戻す (Ctrl+Z)" aria-label="元に戻す"><Icon name="undo"/></button><button className="tool-button history-button" onClick={() => void runEditorHistory("redo")} disabled={!canRedoEditor} title="やり直し (Ctrl+Shift+Z)" aria-label="やり直し"><Icon name="redo"/></button></div>
        <span className="toolbar-separator" />
        <div className="toolbar-group"><button className="tool-button run" onClick={() => runPhits(false)} disabled={!workspace || busy}><Icon name="play"/><span>通常実行</span></button><button className="tool-button production" onClick={() => runPhits(true)} disabled={!workspace || busy}><Icon name="rocket"/><span>本番実行</span></button><button className="tool-button" onClick={async () => { if (workspace) try { await api.stopGracefully(workspace.root, workspace.primaryInput ?? undefined); } catch (error) { notify(errorMessage(error), "error"); } }} disabled={!workspace || !runStatus || !["running", "launchRequested"].includes(runStatus.state)}><Icon name="stop"/><span>停止</span></button></div>
        <span className="toolbar-separator" />
        <div className="utility-group"><span>ツール</span>{(["angel", "dchain", "phig3d"] as UtilityKind[]).map((kind) => <button key={kind} onClick={() => runUtility(kind)} disabled={!activeDocument?.document}>{kind === "phig3d" ? "PHIG-3D" : kind.toUpperCase()}</button>)}</div>
        <div className="toolbar-spacer" /><button className="tool-button compact" onClick={() => editorRef.current?.getAction("actions.find")?.run()} disabled={!activeDocument}><Icon name="search"/><span>検索</span></button><button className={`codex-toggle ${codexOpen ? "active" : ""}`} onClick={() => setCodexOpen((value) => !value)}><Icon name="spark"/><span>Codex</span></button>
      </div>

      <div className="work-area">
        {sidebarOpen && <aside className="explorer-panel" style={{ "--explorer-font-size": `${explorerFontSize}px` } as CSSProperties}>
          <header className="panel-header"><div className="panel-title">エクスプローラー</div><button className="icon-button" onClick={chooseWorkspace} title="フォルダーを開く"><Icon name="folder"/></button></header>
          {workspace ? <>
            <div className="workspace-name" title={workspace.root}><Icon name="chevron"/><span>{fileName(workspace.root)}</span></div>
            <div className="file-list">{allFiles.map((path) => <button className={`file-item${activeDocument?.document?.relativePath === path ? " selected" : ""}${pendingReviewPaths.has(path) ? " codex-pending" : ""}`} onClick={() => openDocument(path)} onContextMenu={(event) => { if (path.toLowerCase().endsWith(".out")) { event.preventDefault(); void analyzeOutput(path); } }} key={path} title={pendingReviewPaths.has(path) ? `${path}（Codexの変更・未確認）` : path.toLowerCase().endsWith(".out") ? `${path}（右クリックでCodex解析）` : path}><Icon name="file"/><span>{path}</span>{pendingReviewPaths.has(path) && <span className="codex-review-marker" aria-label="Codexの変更・未確認">AI</span>}</button>)}{!allFiles.length && <div className="explorer-empty">編集できるファイルがありません。</div>}</div>
            <section className="diagnostics-card"><div className="diagnostics-heading"><span>実行環境</span><button className="diagnostics-refresh" onClick={handleDiagnosticsRefresh} aria-label={diagnosticsBusy || codexProbeBusy || diagnosticsQueuedTurns > 0 ? "実行環境を診断中" : "実行環境を再診断"} aria-busy={diagnosticsBusy || codexProbeBusy || diagnosticsQueuedTurns > 0} title={diagnosticsBusy || codexProbeBusy || diagnosticsQueuedTurns > 0 ? "診断中" : "再診断"}><span ref={diagnosticsRotorRef} className="diagnostics-refresh-rotor"><span ref={diagnosticsPulseRef} className="diagnostics-refresh-pulse"><Icon name="refresh"/></span></span></button></div>{diagnosticsQueuedTurns > 0 && <p className="diagnostics-refresh-status" aria-live="polite">再診断中お待ちください（残り{diagnosticsQueuedTurns}回転）</p>}<div className="diagnostic-row"><span className={`diagnostic-dot ${diagnostics?.compatibility === "supported" ? "ok" : diagnostics?.compatibility === "unsupportedOlder" ? "bad" : "warn"}`}/><div><strong>PHITS {diagnostics?.phitsVersion ?? "—"}</strong><small>{compatibilityLabel(diagnostics?.compatibility)}</small></div></div><div className="diagnostic-row"><span className={`diagnostic-dot ${codexCompatibility?.state === "compatible" ? "ok" : codexCompatibility?.state === "limited" ? "warn" : diagnostics?.codexCompatible ? "muted" : "bad"}`}/><div><strong>Codex {codexCompatibility?.codexVersion ?? diagnostics?.codexVersion ?? "—"}</strong><small>{codexProbeBusy ? "互換性を確認中" : codexCompatibility?.state === "compatible" ? "互換性確認済み" : codexCompatibility?.state === "limited" ? "一部機能のみ利用可能" : "未接続 / 利用不可"}</small></div></div><CodexCompatibilityStatus report={codexCompatibility} busy={codexProbeBusy}/>{diagnostics?.messages.filter((message) => !message.startsWith("Codex CLIは検証基準")).slice(0, 2).map((message) => <p className="diagnostic-message" key={message}>{message}</p>)}</section>
          </> : <div className="workspace-empty"><div className="empty-folder"><Icon name="folder"/></div><strong>ワークスペースなし</strong><p>.inp / .pht を含むフォルダーを開きます。</p><button className="secondary-button" onClick={chooseWorkspace}>フォルダーを開く</button></div>}
        </aside>}

        <main className="editor-column">
          <EditorTabs tabs={documents.map((entry) => ({ id: entry.id, name: entry.name, dirty: entry.dirty, codexPending: !!entry.document && pendingReviewPaths.has(entry.document.relativePath) }))} activeId={activeId} onActivate={activateDocument} onClose={closeDocument}/>
          <div className="editor-stage">{diffReview ? <DiffReview review={diffReview} approval={approvals.find((entry) => diffReview.requestKey === approvalRequestKey(entry))} fontSize={editorFontSize} beforeMount={beforeMount} onSelectFile={(index) => { setDiffReview((current) => current ? { ...current, selectedFileIndex: index } : current); const path = diffReview.files[index]?.path; const entry = documents.find((item) => item.document?.relativePath === path); if (entry) setActiveId(entry.id); }} onDecision={resolveApproval} onFinalize={finalizeCodexReview} onClose={() => setDiffReview(null)}/> : activeDocument ? <Editor height="100%" path={activeDocument.id} language="phits" theme="phits-light" value={activeDocument.content} beforeMount={beforeMount} onMount={onEditorMount} onChange={(content) => setDocuments((current) => current.map((entry) => entry.id === activeDocument.id ? { ...entry, content: content ?? "", dirty: (content ?? "") !== entry.document?.content } : entry))} options={editorOptions} keepCurrentModel loading={<div className="editor-loading">Monaco Editorを読み込んでいます…</div>}/> : <div className="welcome-screen"><h1>PHITS AI Editor</h1><p>PHITS入力の編集、実行、Codex支援をひとつの画面で。</p><div className="welcome-actions"><button className="primary-button" onClick={chooseWorkspace}><Icon name="folder"/>ワークスペースを開く</button><button className="secondary-button" onClick={newDocument}><Icon name="file"/>新しい入力</button></div><div className="welcome-hint"><kbd>Ctrl</kbd> + <kbd>O</kbd> でフォルダーを開く</div></div>}</div>
          <OutputPanel lines={output} collapsed={outputCollapsed} height={outputHeight} onToggle={() => setOutputCollapsed((value) => !value)} onClear={() => setOutput([])} onResizeStart={startHorizontalResize}/>
        </main>

        <CodexPanel open={codexOpen} width={codexWidth} fontSize={codexFontSize} connected={codexConnected} connectionError={codexUnavailableReason} troubleshootingPrompt={codexTroubleshootingPrompt} busy={codexBusy} models={models} model={model} reasoning={reasoning} approvalMode={approvalMode} sessionApprovalActive={sessionApprovalActive} threadId={threadId} threads={threadLinks} chatAvailable={codexFeatureAvailable(codexCompatibility, "chat")} threadsAvailable={codexFeatureAvailable(codexCompatibility, "threads")} writableAvailable={codexFeatureAvailable(codexCompatibility, "fileEditing") && codexFeatureAvailable(codexCompatibility, "approvals")} phitsAgentSetup={phitsAgentSetup} messages={messages} approval={currentApproval} approvalCount={approvals.length} approvalCanAccept={approvalCanAccept} contextChips={contextChips} draftRequest={draftRequest} onToggle={() => setCodexOpen((value) => !value)} onResizeStart={startVerticalResize} onResizeReset={() => setCodexPanelRatio(DEFAULT_CODEX_PANEL_RATIO)} onOpenDiff={() => { if (!currentApproval) return; setDiffReview((current) => current?.requestKey === approvalRequestKey(currentApproval) ? { ...current, selectedFileIndex: 0 } : current); }} onConnect={connectCodex} onDisconnect={disconnectCodex} onModelChange={setModel} onReasoningChange={setReasoning} onApprovalModeChange={setApprovalMode} onNewThread={startThread} onResumeThread={resumeThread} onRenameThread={renameThread} onDeleteThread={deleteThread} onRemoveContext={removeContext} onSend={sendCodex} onInterrupt={interruptCodex} onApproval={resolveApproval}/>
      </div>

      {settingsSection && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsSection(null); }}>
        <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <header className="settings-dialog-header"><div><h2 id="settings-title">設定</h2><p>PHITS AI Editorの表示と実行環境を設定します。</p></div><button className="settings-close" onClick={() => setSettingsSection(null)} aria-label="設定を閉じる">×</button></header>
          <div className="settings-dialog-body">
            <nav className="settings-navigation" aria-label="設定項目">
              <button className={settingsSection === "appearance" ? "selected" : ""} onClick={() => setSettingsSection("appearance")}><strong>表示・フォント</strong><small>文字サイズ</small></button>
              <button className={settingsSection === "phits" ? "selected" : ""} onClick={() => void openSettings("phits")}><strong>PHITS実行環境</strong><small>インストール先</small></button>
            </nav>
            <div className="settings-content menu-settings">
              {settingsSection === "appearance" ? <>
                <div className="settings-section-heading"><h3>表示・フォント</h3><p>各領域の文字サイズを12～28pxで設定します。変更はすぐに反映されます。</p></div>
                <div className="settings-fields">
                  <FontSizeControl label="エクスプローラー" value={explorerFontSize} onChange={setExplorerFontSize}/>
                  <FontSizeControl label="エディター" value={editorFontSize} onChange={setEditorFontSize}/>
                  <FontSizeControl label="Codexパネル" value={codexFontSize} onChange={setCodexFontSize}/>
                </div>
                <div className="settings-actions split">
                  <button className="secondary-button" onClick={() => {
                    setExplorerFontSize(fontSizeDefaults.explorerFontSize);
                    setEditorFontSize(fontSizeDefaults.editorFontSize);
                    setCodexFontSize(fontSizeDefaults.codexFontSize);
                  }}>既定設定に戻す</button>
                  <button className="primary-button" onClick={() => {
                    const defaults = { explorerFontSize, editorFontSize, codexFontSize };
                    setFontSizeDefaults(defaults);
                    saveFontSizeDefaults(defaults);
                    notify("現在の文字サイズをアプリ全体の既定設定として保存しました。", "success");
                  }}>現在値を既定として保存</button>
                </div>
              </> : <>
                <div className="settings-section-heading"><h3>PHITS実行環境</h3><p>PHITSのルートフォルダーを選択します。システムのPATHやPHITSPATHは変更しません。</p></div>
                <fieldset className="phits-path-modes">
                  <label><input type="radio" name="phits-path-mode" checked={phitsSettingsMode === "auto"} onChange={() => setPhitsSettingsMode("auto")}/><span><strong>自動検出（推奨）</strong><small>環境変数PHITSPATH、続いて標準位置を確認します。</small></span></label>
                  <label><input type="radio" name="phits-path-mode" checked={phitsSettingsMode === "custom"} onChange={() => { setPhitsSettingsMode("custom"); if (!phitsPathDraft) setPhitsPathDraft(diagnostics?.phitsRoot ?? ""); }}/><span><strong>フォルダーを指定</strong><small>このアプリ全体で使用するPHITSを明示します。</small></span></label>
                </fieldset>
                <div className="path-setting-row">
                  <input aria-label="PHITSインストールフォルダー" value={phitsPathDraft} disabled={phitsSettingsMode !== "custom"} onChange={(event) => setPhitsPathDraft(event.target.value)} placeholder="C:\\phits"/>
                  <button className="secondary-button" disabled={phitsSettingsMode !== "custom"} onClick={() => void browsePhitsRoot()}>参照…</button>
                </div>
                <section className={`phits-detection-card ${diagnostics?.phitsReady ? "ready" : "warning"}`}>
                  <div className="phits-detection-title"><span className={`diagnostic-dot ${diagnostics?.phitsReady ? "ok" : "warn"}`}/><strong>{diagnostics?.phitsReady ? "PHITSを実行できます" : "PHITS実行環境を確認してください"}</strong></div>
                  <dl><div><dt>使用中のフォルダー</dt><dd title={diagnostics?.phitsRoot ?? undefined}>{diagnostics?.phitsRoot ?? "未検出"}</dd></div><div><dt>検出元</dt><dd>{phitsPathSourceLabel(diagnostics?.phitsPathSource)}</dd></div><div><dt>バージョン</dt><dd>{diagnostics?.phitsVersion ?? "未検出"}（{compatibilityLabel(diagnostics?.compatibility)}）</dd></div><div><dt>公式ラッパー</dt><dd>{diagnostics?.phitsWrapper ? "確認済み" : "未検出"}</dd></div></dl>
                  {diagnostics?.phitsPathSource === "workspaceSetting" && <p className="settings-note">現在のワークスペース専用設定が、ここで指定するアプリ全体設定より優先されています。</p>}
                </section>
                <div className="settings-actions"><button className="primary-button" disabled={phitsSettingsSaving} onClick={() => void savePhitsSettings()}>{phitsSettingsSaving ? "確認中…" : "設定を保存して確認"}</button></div>
              </>}
            </div>
          </div>
        </section>
      </div>}

      {closeDocumentPrompt && (() => {
        const entry = documents.find((item) => item.id === closeDocumentPrompt.documentId);
        return entry ? <UnsavedChangesDialog fileName={entry.name} busy={closeDocumentPrompt.busy} onCancel={() => setCloseDocumentPrompt(null)} onDiscard={() => void completeCloseDocument(false)} onSave={() => void completeCloseDocument(true)}/> : null;
      })()}

      {workspaceSwitchPrompt && <UnsavedChangesDialog
        fileName={workspaceSwitchPrompt.documentIds.length === 1
          ? documents.find((item) => item.id === workspaceSwitchPrompt.documentIds[0])?.name ?? "1件のファイル"
          : `${workspaceSwitchPrompt.documentIds.length}件のファイル`}
        busy={workspaceSwitchPrompt.busy}
        title="ワークスペースを切り替えますか？"
        warning="保存せず切り替えると、未保存の変更は失われます。"
        discardLabel="保存せず切り替える"
        saveLabel="保存して切り替える"
        busyLabel="処理中…"
        onCancel={() => setWorkspaceSwitchPrompt(null)}
        onDiscard={() => void completeWorkspaceSwitch(false)}
        onSave={() => void completeWorkspaceSwitch(true)}
      />}

      {closeApplicationPrompt && <UnsavedChangesDialog
        fileName={closeApplicationPrompt.documentIds.length === 1
          ? documents.find((item) => item.id === closeApplicationPrompt.documentIds[0])?.name ?? "1件のファイル"
          : `${closeApplicationPrompt.documentIds.length}件のファイル`}
        busy={closeApplicationPrompt.busy}
        title="PHITS AI Editorを終了しますか？"
        warning="保存せず終了すると、未保存の変更は失われます。"
        discardLabel="保存せず終了"
        saveLabel="保存して終了"
        busyLabel="処理中…"
        onCancel={() => setCloseApplicationPrompt(null)}
        onDiscard={() => void completeApplicationClose(false)}
        onSave={() => void completeApplicationClose(true)}
      />}

      {conflict && <div className="modal-backdrop"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-label="Codex変更との競合"><h2>ファイル変更が競合しています</h2><p><strong>{conflict.path}</strong> はCodex処理中にもEditorで変更されました。左がEditor、右がCodex側です。</p><DiffEditor height="300px" original={documents.find((entry) => entry.id === conflict.entryId)?.content ?? ""} modified={conflict.disk.content} language="phits" theme="phits-light" options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, automaticLayout: true, colorDecorators: false, fontSize: editorFontSize }}/><div className="conflict-actions"><button className="secondary-button" onClick={() => setConflict(null)}>後で決める</button><button className="secondary-button" onClick={async () => { const entry = documents.find((item) => item.id === conflict.entryId); if (!entry || !workspace) return; try { const saved = await api.saveDocument(workspace.root, conflict.disk, entry.content); setDocuments((current) => current.map((item) => item.id === entry.id ? { ...item, document: saved, content: saved.content, dirty: false } : item)); setConflictedPaths((current) => { const next = new Set(current); next.delete(conflict.path); return next; }); setConflict(null); } catch (error) { notify(`Editor側を保存できませんでした: ${errorMessage(error)}`, "error"); } }}>Editor側を保存</button><button className="primary-button" onClick={() => { setDocuments((current) => current.map((item) => item.id === conflict.entryId ? { ...item, id: conflict.disk.path, document: conflict.disk, content: conflict.disk.content, dirty: false } : item)); setConflictedPaths((current) => { const next = new Set(current); next.delete(conflict.path); return next; }); setConflict(null); }}>Codex側を読み込む</button></div></section></div>}

      <footer className="status-bar"><div className="status-section"><span className={`status-indicator ${busy ? "busy" : ""}`}/><span>{runStatus ? runStatus.message : busy ? "処理中…" : "準備完了"}</span></div><div className="status-spacer" />{activeDocument?.document && <><span>{activeDocument.document.encoding.toUpperCase()}</span><span>{activeDocument.document.lineEnding.toUpperCase()}</span></>}<span>行 {cursor.line}, 列 {cursor.column}</span><span>PHITS {diagnostics?.phitsVersion ?? "未検出"}</span></footer>
      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast ${toast.kind}`} key={toast.id}>{toast.message}</div>)}</div>
    </div>
  );
}
