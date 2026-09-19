import type { CodexSandboxCheckId, CodexSandboxProbeReport } from "./types";

const REQUIRED_EDIT_CHECKS: CodexSandboxCheckId[] = [
  "commandExecution",
  "workspaceCreate",
  "existingFileWrite",
  "childDirectoryWrite",
];

export type CodexSandboxSetupMode = "elevated" | "unelevated";

export function sandboxEditingAvailable(report: CodexSandboxProbeReport | null | undefined): boolean {
  if (!report) return false;
  if (typeof report.editingAvailable === "boolean") return report.editingAvailable;
  return REQUIRED_EDIT_CHECKS.every((id) => report.checks.some((check) => check.id === id && check.state === "available"));
}

export function sandboxSetupModes(report: CodexSandboxProbeReport | null | undefined): CodexSandboxSetupMode[] {
  if (!report?.setupRecommended) return [];
  const allowed = report.allowedImplementations.filter(
    (mode): mode is CodexSandboxSetupMode => mode === "elevated" || mode === "unelevated",
  );
  const permits = (mode: CodexSandboxSetupMode) => allowed.length === 0 || allowed.includes(mode);
  const modes: CodexSandboxSetupMode[] = [];

  if (permits("elevated")) modes.push("elevated");
  if (permits("unelevated")) modes.push("unelevated");
  return modes;
}
