export const DIAGNOSTICS_TURN_BASE_MS = 600;
export const DIAGNOSTICS_TURN_MIN_MS = 120;
export const DIAGNOSTICS_SPEED_COEFFICIENT = 3.37;
export const DIAGNOSTICS_RAPID_GAP_MS = 800;
export const DIAGNOSTICS_RAPID_THRESHOLD_MS = 7_000;

export function diagnosticsTurnDuration(remainingTurns: number): number {
  const turns = Number.isFinite(remainingTurns) ? Math.max(1, Math.floor(remainingTurns)) : 1;
  return Math.max(
    DIAGNOSTICS_TURN_MIN_MS,
    Math.round(DIAGNOSTICS_TURN_BASE_MS / Math.sqrt(1 + (turns - 1) / DIAGNOSTICS_SPEED_COEFFICIENT)),
  );
}

export function shouldRequestDiagnostics(rapidMode: boolean, inFlightCount: number): boolean {
  return !rapidMode && inFlightCount < 1;
}
