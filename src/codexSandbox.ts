import type { CodexSandboxCheckId, CodexSandboxProbeReport } from "./types";

const REQUIRED_EDIT_CHECKS: CodexSandboxCheckId[] = [
  "commandExecution",
  "workspaceCreate",
  "existingFileWrite",
  "childDirectoryWrite",
];

export function sandboxEditingAvailable(report: CodexSandboxProbeReport | null | undefined): boolean {
  if (!report) return false;
  if (typeof report.editingAvailable === "boolean") return report.editingAvailable;
  return REQUIRED_EDIT_CHECKS.every((id) => report.checks.some((check) => check.id === id && check.state === "available"));
}
