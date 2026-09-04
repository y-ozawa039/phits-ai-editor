import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { api } from "./api";
import { CodexPanel, type ChatMessage } from "./components/CodexPanel";
import { EditorTabs } from "./components/EditorTabs";
import { Icon } from "./components/Icons";
import { OutputPanel } from "./components/OutputPanel";
import { registerPhitsLanguage } from "./phitsLanguage";
import type { ApprovalRequest, CodexEvent, CodexModel, CodexThreadLink, DocumentData, RunStatus, RuntimeDiagnostics, UtilityKind, WorkspaceInfo } from "./types";

interface OpenDocument {
  id: string;
  name: string;
  document: DocumentData | null;
  content: string;
  dirty: boolean;
}

type ToastKind = "info" | "success" | "error";
interface Toast { id: number; kind: ToastKind; message: string }

const EVENT_NAMES = {
  output: ["phits-output", "phits://output"],
  run: ["phits://state", "phits-run-status", "phits://run-status"],
  codex: ["codex-event", "codex://event"],
  approval: ["codex-approval", "codex://approval"],
  diagnostics: ["diagnostics-changed", "runtime://diagnostics"],
  codexLog: ["codex://log"],
  codexDisconnected: ["codex://disconnected"],
} as const;

const isTauri = () => "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

function payloadText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || payload === null) return "";
  const value = payload as Record<string, unknown>;
  for (const key of ["text", "delta", "message", "output", "content"]) if (typeof value[key] === "string") return value[key] as string;
  return "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
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
        const text = record.content.map(payloadText).filter(Boolean).join("\n");
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

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [codexOpen, setCodexOpen] = useState(true);
  const [codexWidth, setCodexWidth] = useState(376);
  const [outputHeight, setOutputHeight] = useState(206);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
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
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const languageDisposeRef = useRef<{ dispose(): void } | null>(null);
  const languageSpecRef = useRef<unknown>(undefined);
  const toastCounter = useRef(0);
  const activeDocument = documents.find((entry) => entry.id === activeId) ?? null;
  const hasDirtyDocuments = documents.some((entry) => entry.dirty);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++toastCounter.current;
    setToasts((current) => [...current.slice(-2), { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);

  const appendOutput = useCallback((value: string) => {
    const lines = value.replace(/\r/g, "").split("\n").filter((line, index, all) => line || index < all.length - 1);
    if (lines.length) setOutput((current) => [...current, ...lines].slice(-4000));
  }, []);

  const updateDiagnostics = useCallback(async (root?: string) => {
    if (!isTauri()) return;
    try {
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
  }, [notify]);

  const openDocument = useCallback(async (relativePath: string, targetWorkspace = workspace) => {
    if (!targetWorkspace) return;
    const existing = documents.find((entry) => entry.document?.relativePath === relativePath);
    if (existing) { setActiveId(existing.id); return; }
    try {
      const document = await api.readDocument(targetWorkspace.root, relativePath);
      const next = { id: document.path, name: fileName(relativePath), document, content: document.content, dirty: false };
      setDocuments((current) => [...current, next]);
      setActiveId(next.id);
    } catch (error) { notify(`${relativePath} を開けませんでした: ${errorMessage(error)}`, "error"); }
  }, [documents, notify, workspace]);

  const chooseWorkspace = useCallback(async () => {
    if (!isTauri()) { notify("フォルダー選択はデスクトップアプリで利用できます。"); return; }
    if (hasDirtyDocuments && !window.confirm("未保存の変更があります。別のワークスペースを開きますか？")) return;
    try {
      const selected = await open({ directory: true, multiple: false, title: "PHITSワークスペースを開く" });
      if (!selected || Array.isArray(selected)) return;
      setBusy(true);
      const info = await api.openWorkspace(selected);
      setWorkspace(info); setDocuments([]); setActiveId(null); setOutput([]); setRunStatus(null);
      await updateDiagnostics(info.root);
      const first = info.primaryInput ?? info.candidateInputs[0] ?? info.auxiliaryFiles[0];
      if (first) {
        const document = await api.readDocument(info.root, first);
        const next = { id: document.path, name: fileName(first), document, content: document.content, dirty: false };
        setDocuments([next]); setActiveId(next.id);
      }
      if (info.candidateInputs.length > 1) notify("主入力候補が複数あります。実行前に1つに絞ってください。");
    } catch (error) { notify(`ワークスペースを開けませんでした: ${errorMessage(error)}`, "error"); }
    finally { setBusy(false); }
  }, [hasDirtyDocuments, notify, updateDiagnostics]);

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
    notify(`${fileName(saved.relativePath)} を保存しました。`, "success");
    return saved;
  }, [activeDocument, notify, workspace]);

  const saveDocument = useCallback(async () => {
    if (!workspace || !activeDocument) return;
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
  }, [activeDocument, notify, saveDocumentAs, workspace]);

  const closeDocument = useCallback((id: string) => {
    const index = documents.findIndex((entry) => entry.id === id);
    if (index < 0 || (documents[index].dirty && !window.confirm(`${documents[index].name} の変更を破棄して閉じますか？`))) return;
    const next = documents.filter((entry) => entry.id !== id);
    setDocuments(next);
    if (id === activeId) setActiveId(next[Math.min(index, next.length - 1)]?.id ?? null);
  }, [activeId, documents]);

  const runPhits = useCallback(async (production: boolean) => {
    if (!workspace) { notify("先にワークスペースを開いてください。"); return; }
    const warning = production
      ? "未保存内容を保存後、入力と既存出力を記録します。Codexを停止してPHITSを起動し、Editorを直ちに終了します。続行しますか？"
      : hasDirtyDocuments ? "未保存の変更を保存して主入力を通常実行しますか？" : "主入力を通常実行しますか？";
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
      const status = await (production ? api.runProduction(workspace.root, overrideUnresolved) : api.runNormal(workspace.root, overrideUnresolved)) as RunStatus;
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
    try {
      setCodexBusy(true);
      const connection = await api.codexConnect(workspace.root);
      const available = connection.models;
      const selected = available.find((entry) => entry.isDefault) ?? available[0];
      setModels(available); setThreadLinks(connection.threads); setModel(selected?.id ?? ""); setReasoning(selected?.defaultReasoningEffort ?? selected?.supportedReasoningEfforts[0] ?? ""); setCodexConnected(true);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", text: "Codex App Serverに接続しました。" }]);
    } catch (error) { notify(`Codexに接続できませんでした: ${errorMessage(error)}`, "error"); }
    finally { setCodexBusy(false); }
  }, [notify, workspace]);

  const disconnectCodex = useCallback(async () => {
    try { await api.codexDisconnect(); } catch { /* safe local disconnected state */ }
    setCodexConnected(false); setThreadId(null); setTurnId(null); setCodexBusy(false); setApproval(null);
  }, []);

  const startThread = useCallback(async () => {
    if (!workspace) return;
    try { setCodexBusy(true); const id = await api.codexThreadStart(workspace.root, model || undefined, reasoning || undefined); setThreadId(id); setThreadLinks((current) => [{ threadId: id, title: "新しい会話", lastUsedAt: new Date().toISOString(), model, reasoningEffort: reasoning }, ...current.filter((item) => item.threadId !== id)]); setMessages([]); }
    catch (error) { notify(`スレッドを開始できませんでした: ${errorMessage(error)}`, "error"); }
    finally { setCodexBusy(false); }
  }, [model, notify, reasoning, workspace]);

  const resumeThread = useCallback(async (id: string) => {
    if (!workspace) return;
    try { setCodexBusy(true); const history = await api.codexThreadResume(workspace.root, id); setThreadId(id); setMessages(historyMessages(history)); }
    catch (error) { notify(`スレッドを再開できませんでした: ${errorMessage(error)}`, "error"); }
    finally { setCodexBusy(false); }
  }, [notify, workspace]);

  const sendCodex = useCallback(async (text: string) => {
    if (!threadId) return;
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, text };
    const assistantMessage = { id: crypto.randomUUID(), role: "assistant" as const, text: "", streaming: true };
    setMessages((current) => [...current, userMessage, assistantMessage]); setCodexBusy(true);
    try {
      const response = await api.codexTurnStart(threadId, text, model || undefined, reasoning || undefined) as unknown;
      if (typeof response === "object" && response !== null) {
        const record = response as Record<string, unknown>;
        const turn = record.turn;
        if (typeof record.turnId === "string") setTurnId(record.turnId);
        else if (typeof record.id === "string") setTurnId(record.id);
        else if (typeof turn === "object" && turn !== null && typeof (turn as Record<string, unknown>).id === "string") setTurnId((turn as Record<string, unknown>).id as string);
      }
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantMessage.id ? { ...message, text: `送信エラー: ${errorMessage(error)}`, streaming: false } : message)); setCodexBusy(false);
    }
  }, [model, reasoning, threadId]);

  const interruptCodex = useCallback(async () => {
    if (!threadId || !turnId) { setCodexBusy(false); return; }
    try { await api.codexTurnInterrupt(threadId, turnId); } catch (error) { notify(`中断できませんでした: ${errorMessage(error)}`, "error"); }
  }, [notify, threadId, turnId]);

  const resolveApproval = useCallback(async (decision: "accept" | "decline") => {
    if (!approval) return;
    try { await api.resolveApproval(approval, decision); setApproval(null); }
    catch (error) { notify(`承認結果を送信できませんでした: ${errorMessage(error)}`, "error"); }
  }, [approval, notify]);

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
    void attach<ApprovalRequest>(EVENT_NAMES.approval, setApproval);
    void attach<RuntimeDiagnostics>(EVENT_NAMES.diagnostics, setDiagnostics);
    void attach<string>(EVENT_NAMES.codexLog, (line) => setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", text: line }]));
    void attach<unknown>(EVENT_NAMES.codexDisconnected, () => { setCodexConnected(false); setCodexBusy(false); setTurnId(null); });
    void attach<CodexEvent>(EVENT_NAMES.codex, (event) => {
      const text = payloadText(event.params), method = event.method.toLowerCase();
      if (method.includes("approval") && typeof event.params === "object" && event.params !== null) setApproval(event.params as ApprovalRequest);
      if (text) setMessages((current) => {
        let lastIndex = -1;
        for (let index = current.length - 1; index >= 0; index -= 1) {
          if (current[index].role === "assistant" && current[index].streaming) { lastIndex = index; break; }
        }
        if (lastIndex < 0) return [...current, { id: crypto.randomUUID(), role: "assistant", text, streaming: !method.includes("complete") }];
        return current.map((message, index) => index === lastIndex ? { ...message, text: message.text + text, streaming: !method.includes("complete") } : message);
      });
      if (["completed", "complete", "failed", "interrupted"].some((part) => method.includes(part))) {
        setCodexBusy(false); setTurnId(null); setMessages((current) => current.map((message) => message.streaming ? { ...message, streaming: false } : message));
      }
    });
    void updateDiagnostics();
    return () => { cancelled = true; unlisteners.forEach((unlisten) => unlisten()); };
  }, [appendOutput, updateDiagnostics]);

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
    const handler = (event: BeforeUnloadEvent) => { if (hasDirtyDocuments) event.preventDefault(); };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirtyDocuments]);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco;
    languageDisposeRef.current?.dispose(); languageDisposeRef.current = registerPhitsLanguage(monaco, languageSpecRef.current);
    monaco.editor.defineTheme("phits-light", { base: "vs", inherit: true, rules: [
      { token: "type.identifier", foreground: "075F96", fontStyle: "bold" }, { token: "attribute.name", foreground: "7B3F00" }, { token: "comment", foreground: "73808C", fontStyle: "italic" },
    ], colors: { "editor.background": "#FCFDFE", "editor.lineHighlightBackground": "#F2F7FA", "editor.selectionBackground": "#B7DCEFAA" } });
  }, []);

  const onEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor; editor.onDidChangeCursorPosition(({ position }) => setCursor({ line: position.lineNumber, column: position.column })); editor.focus();
  }, []);

  const editorOptions = useMemo<MonacoEditor.IStandaloneEditorConstructionOptions>(() => ({
    automaticLayout: true, fontFamily: '"Cascadia Mono", "Consolas", monospace', fontSize: 14, lineHeight: 22,
    minimap: { enabled: true, scale: 0.8 }, scrollBeyondLastLine: false, smoothScrolling: true, wordWrap: "on", wrappingIndent: "indent",
    renderWhitespace: "selection", padding: { top: 12, bottom: 16 }, bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true },
    quickSuggestions: { other: true, comments: false, strings: false },
  }), []);

  const startVerticalResize = useCallback((event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId); const startX = event.clientX, startWidth = codexWidth;
    const move = (e: PointerEvent) => setCodexWidth(Math.max(300, Math.min(620, startWidth + startX - e.clientX)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, [codexWidth]);

  const startHorizontalResize = useCallback((event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId); const startY = event.clientY, startHeight = outputHeight;
    const move = (e: PointerEvent) => setOutputHeight(Math.max(110, Math.min(480, startHeight + startY - e.clientY)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, [outputHeight]);

  const allFiles = workspace ? Array.from(new Set([...workspace.candidateInputs, ...workspace.auxiliaryFiles])) : [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="title-row"><div className="app-icon">P</div><strong>PHITS AI Editor</strong><span className="alpha-badge">ALPHA</span></div>
        <nav className="menu-bar" aria-label="メインメニュー">
          <details><summary>ファイル</summary><div className="menu-popover"><button onClick={newDocument}>新規ファイル <kbd>Ctrl+N</kbd></button><button onClick={chooseWorkspace}>ワークスペースを開く… <kbd>Ctrl+O</kbd></button><hr/><button onClick={saveDocument} disabled={!activeDocument}>保存 <kbd>Ctrl+S</kbd></button><button onClick={() => void saveDocumentAs()} disabled={!activeDocument}>名前を付けて保存…</button></div></details>
          <details><summary>編集</summary><div className="menu-popover"><button onClick={() => void editorRef.current?.getAction("undo")?.run()}>元に戻す <kbd>Ctrl+Z</kbd></button><button onClick={() => void editorRef.current?.getAction("redo")?.run()}>やり直し</button><hr/><button onClick={() => void editorRef.current?.getAction("actions.find")?.run()}>検索 <kbd>Ctrl+F</kbd></button><button onClick={() => void editorRef.current?.getAction("editor.action.startFindReplaceAction")?.run()}>置換 <kbd>Ctrl+H</kbd></button></div></details>
          <details><summary>実行</summary><div className="menu-popover"><button onClick={() => runPhits(false)}>PHITS 通常実行</button><button onClick={() => runPhits(true)}>PHITS 本番実行…</button><hr/><button onClick={() => runUtility("angel")}>ANGEL</button><button onClick={() => runUtility("dchain")}>DCHAIN</button><button onClick={() => runUtility("phig3d")}>PHIG-3D</button></div></details>
          <details><summary>表示</summary><div className="menu-popover"><button onClick={() => setSidebarOpen((value) => !value)}>エクスプローラー</button><button onClick={() => setCodexOpen((value) => !value)}>Codexパネル</button><button onClick={() => setOutputCollapsed((value) => !value)}>出力パネル</button></div></details>
          <details><summary>ヘルプ</summary><div className="menu-popover menu-help"><p>PHITS 3.37 / Codex CLI 0.153.1<br/>検証基準のα版です。</p></div></details>
        </nav>
      </header>

      <div className="toolbar" role="toolbar" aria-label="エディターツールバー">
        <div className="toolbar-group"><button className="tool-button" onClick={chooseWorkspace} title="ワークスペースを開く (Ctrl+O)"><Icon name="folder"/><span>開く</span></button><button className="tool-button" onClick={saveDocument} disabled={!activeDocument?.dirty} title="保存 (Ctrl+S)"><Icon name="save"/><span>保存</span></button></div>
        <span className="toolbar-separator" />
        <div className="toolbar-group"><button className="tool-button run" onClick={() => runPhits(false)} disabled={!workspace || busy}><Icon name="play"/><span>通常実行</span></button><button className="tool-button production" onClick={() => runPhits(true)} disabled={!workspace || busy}><Icon name="rocket"/><span>本番実行</span></button><button className="tool-button" onClick={async () => { if (workspace) try { await api.stopGracefully(workspace.root); } catch (error) { notify(errorMessage(error), "error"); } }} disabled={!workspace || !runStatus || !["running", "launchRequested"].includes(runStatus.state)}><Icon name="stop"/><span>停止</span></button></div>
        <span className="toolbar-separator" />
        <div className="utility-group"><span>ツール</span>{(["angel", "dchain", "phig3d"] as UtilityKind[]).map((kind) => <button key={kind} onClick={() => runUtility(kind)} disabled={!activeDocument?.document}>{kind === "phig3d" ? "PHIG-3D" : kind.toUpperCase()}</button>)}</div>
        <div className="toolbar-spacer" /><button className="tool-button compact" onClick={() => editorRef.current?.getAction("actions.find")?.run()} disabled={!activeDocument}><Icon name="search"/><span>検索</span></button><button className={`codex-toggle ${codexOpen ? "active" : ""}`} onClick={() => setCodexOpen((value) => !value)}><Icon name="spark"/><span>Codex</span></button>
      </div>

      <div className="work-area">
        {sidebarOpen && <aside className="explorer-panel">
          <header className="panel-header"><div className="panel-title">エクスプローラー</div><button className="icon-button" onClick={chooseWorkspace} title="フォルダーを開く"><Icon name="folder"/></button></header>
          {workspace ? <>
            <div className="workspace-name" title={workspace.root}><Icon name="chevron"/><span>{fileName(workspace.root)}</span></div>
            <div className="file-list">{allFiles.map((path) => <button className={`file-item${activeDocument?.document?.relativePath === path ? " selected" : ""}`} onClick={() => openDocument(path)} key={path} title={path}><Icon name="file"/><span>{path}</span>{path === workspace.primaryInput && <span className="primary-tag">主</span>}</button>)}{!allFiles.length && <div className="explorer-empty">編集できるファイルがありません。</div>}</div>
            <section className="diagnostics-card"><div className="diagnostics-heading"><span>実行環境</span><button onClick={() => updateDiagnostics(workspace.root)} title="再診断"><Icon name="refresh"/></button></div><div className="diagnostic-row"><span className={`diagnostic-dot ${diagnostics?.compatibility === "supported" ? "ok" : diagnostics?.compatibility === "unsupportedOlder" ? "bad" : "warn"}`}/><div><strong>PHITS {diagnostics?.phitsVersion ?? "—"}</strong><small>{compatibilityLabel(diagnostics?.compatibility)}</small></div></div><div className="diagnostic-row"><span className={`diagnostic-dot ${diagnostics?.codexCompatible ? "ok" : "muted"}`}/><div><strong>Codex {diagnostics?.codexVersion ?? "—"}</strong><small>{diagnostics?.codexCompatible ? "利用可能" : "未接続 / 利用不可"}</small></div></div>{diagnostics?.messages.slice(0, 2).map((message) => <p className="diagnostic-message" key={message}>{message}</p>)}</section>
          </> : <div className="workspace-empty"><div className="empty-folder"><Icon name="folder"/></div><strong>ワークスペースなし</strong><p>.inp / .pht を含むフォルダーを開きます。</p><button className="secondary-button" onClick={chooseWorkspace}>フォルダーを開く</button></div>}
        </aside>}

        <main className="editor-column">
          <EditorTabs tabs={documents.map((entry) => ({ id: entry.id, name: entry.name, dirty: entry.dirty, primary: entry.document?.relativePath === workspace?.primaryInput }))} activeId={activeId} onActivate={setActiveId} onClose={closeDocument}/>
          <div className="editor-stage">{activeDocument ? <Editor height="100%" path={activeDocument.id} language="phits" theme="phits-light" value={activeDocument.content} beforeMount={beforeMount} onMount={onEditorMount} onChange={(content) => setDocuments((current) => current.map((entry) => entry.id === activeDocument.id ? { ...entry, content: content ?? "", dirty: (content ?? "") !== entry.document?.content } : entry))} options={editorOptions} loading={<div className="editor-loading">Monaco Editorを読み込んでいます…</div>}/> : <div className="welcome-screen"><div className="welcome-mark">P</div><h1>PHITS AI Editor</h1><p>PHITS入力の編集、実行、Codex支援をひとつの画面で。</p><div className="welcome-actions"><button className="primary-button" onClick={chooseWorkspace}><Icon name="folder"/>ワークスペースを開く</button><button className="secondary-button" onClick={newDocument}><Icon name="file"/>新しい入力</button></div><div className="welcome-hint"><kbd>Ctrl</kbd> + <kbd>O</kbd> でフォルダーを開く</div></div>}</div>
          <OutputPanel lines={output} collapsed={outputCollapsed} height={outputHeight} onToggle={() => setOutputCollapsed((value) => !value)} onClear={() => setOutput([])} onResizeStart={startHorizontalResize}/>
        </main>

        <CodexPanel open={codexOpen} width={codexWidth} connected={codexConnected} busy={codexBusy} models={models} model={model} reasoning={reasoning} threadId={threadId} threads={threadLinks} messages={messages} approval={approval} onToggle={() => setCodexOpen((value) => !value)} onResizeStart={startVerticalResize} onConnect={connectCodex} onDisconnect={disconnectCodex} onModelChange={setModel} onReasoningChange={setReasoning} onNewThread={startThread} onResumeThread={resumeThread} onSend={sendCodex} onInterrupt={interruptCodex} onApproval={resolveApproval}/>
      </div>

      <footer className="status-bar"><div className="status-section"><span className={`status-indicator ${busy ? "busy" : ""}`}/><span>{runStatus ? runStatus.message : busy ? "処理中…" : "準備完了"}</span></div><div className="status-spacer" />{activeDocument?.document && <><span>{activeDocument.document.encoding.toUpperCase()}</span><span>{activeDocument.document.lineEnding.toUpperCase()}</span></>}<span>行 {cursor.line}, 列 {cursor.column}</span><span>PHITS {diagnostics?.phitsVersion ?? "未検出"}</span></footer>
      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast ${toast.kind}`} key={toast.id}>{toast.message}</div>)}</div>
    </div>
  );
}
