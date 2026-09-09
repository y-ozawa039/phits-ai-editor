import type { ApprovalDecision, ApprovalFileChange, ApprovalKind, ApprovalRequest } from "./types";

const MAX_DIFF_CHARACTERS = 500_000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function optionalString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" ? value : undefined;
}

function requestId(value: unknown): number | string | null {
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function approvalKind(method: string, value: unknown): ApprovalKind | null {
  const expected = method === "item/fileChange/requestApproval"
    ? "fileChange"
    : method === "item/commandExecution/requestApproval"
      ? "commandExecution"
      : null;
  if (!expected || (value !== undefined && value !== expected)) return null;
  return expected;
}

function normalizedChanges(value: unknown): ApprovalFileChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const change = record(entry);
    if (!change || typeof change.path !== "string" || typeof change.diff !== "string") return [];
    return [{
      path: change.path,
      kind: change.kind,
      diff: truncateDiff(change.diff),
    }];
  });
}

const SIMPLE_DECISIONS: ApprovalDecision[] = ["accept", "acceptForSession", "decline", "cancel"];

export function normalizeAvailableDecisions(value: unknown, kind: ApprovalKind): ApprovalDecision[] {
  const source = Array.isArray(value) ? value : [];
  const values = source.flatMap((entry): ApprovalDecision[] => {
    if (typeof entry === "string" && SIMPLE_DECISIONS.includes(entry as ApprovalDecision)) return [entry as ApprovalDecision];
    if (kind === "commandExecution" && typeof entry === "object" && entry !== null && "acceptWithExecpolicyAmendment" in entry) {
      return ["acceptWithExecPolicyAmendment"];
    }
    return [];
  });
  const defaults: ApprovalDecision[] = kind === "fileChange"
    ? ["accept", "acceptForSession", "decline", "cancel"]
    : ["accept", "acceptForSession", "decline", "cancel"];
  return Array.from(new Set(values.length ? values : defaults));
}

export function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARACTERS) return diff;
  return `${diff.slice(0, MAX_DIFF_CHARACTERS)}\n\n[差分が大きいため、${MAX_DIFF_CHARACTERS.toLocaleString()}文字で表示を省略しました]`;
}

export function normalizeApprovalRequest(value: unknown): ApprovalRequest | null {
  const source = record(value);
  if (!source) return null;
  const id = requestId(source.requestId);
  const method = typeof source.method === "string" ? source.method : "";
  const kind = approvalKind(method, source.kind);
  if (id === null || !method || !kind) return null;
  return {
    requestId: id,
    method,
    kind,
    workspaceRoot: optionalString(source.workspaceRoot) ?? undefined,
    threadId: optionalString(source.threadId) ?? undefined,
    turnId: optionalString(source.turnId) ?? undefined,
    itemId: optionalString(source.itemId) ?? undefined,
    startedAtMs: typeof source.startedAtMs === "number" ? source.startedAtMs : undefined,
    reason: optionalString(source.reason),
    grantRoot: optionalString(source.grantRoot),
    command: optionalString(source.command),
    cwd: optionalString(source.cwd),
    commandActions: Array.isArray(source.commandActions) ? source.commandActions : undefined,
    networkApprovalContext: source.networkApprovalContext,
    additionalPermissions: source.additionalPermissions,
    proposedExecpolicyAmendment: source.proposedExecpolicyAmendment,
    proposedNetworkPolicyAmendments: source.proposedNetworkPolicyAmendments,
    availableDecisions: normalizeAvailableDecisions(source.availableDecisions, kind),
    changes: normalizedChanges(source.changes),
    turnDiff: typeof source.turnDiff === "string" ? truncateDiff(source.turnDiff) : undefined,
  };
}

export function approvalRequestKey(value: Pick<ApprovalRequest, "requestId" | "method">): string {
  return `${typeof value.requestId}:${String(value.requestId)}:${value.method}`;
}

export function sameRequestId(left: number | string, right: number | string): boolean {
  return typeof left === typeof right && left === right;
}

export function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[@-_]/g, "")
    .replace(/\r/g, "");
}

export function changeKindLabel(kind: unknown): string {
  const kindRecord = record(kind);
  const value = typeof kind === "string" ? kind : typeof kindRecord?.type === "string" ? kindRecord.type : "update";
  if (value === "add") return "新規作成";
  if (value === "delete") return "削除";
  if (value === "update") return "変更";
  return value;
}

export interface DiffSides {
  original: string;
  modified: string;
}

export function unifiedDiffSides(diff: string): DiffSides {
  const original: string[] = [];
  const modified: string[] = [];
  let inHunk = false;
  for (const line of stripAnsi(diff).split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\ No newline at end of file")) continue;
    if (line.startsWith("+")) modified.push(line.slice(1));
    else if (line.startsWith("-")) original.push(line.slice(1));
    else if (line.startsWith(" ")) {
      original.push(line.slice(1));
      modified.push(line.slice(1));
    }
  }
  return { original: original.join("\n"), modified: modified.join("\n") };
}

export function languageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "inp" || extension === "pht") return "phits";
  if (extension === "json") return "json";
  if (extension === "ts" || extension === "tsx") return "typescript";
  if (extension === "rs") return "rust";
  if (extension === "ps1") return "powershell";
  return "plaintext";
}
