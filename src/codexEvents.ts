export function isCodexTurnStarted(method: string): boolean {
  return method.toLowerCase() === "turn/started";
}

export function isCodexTurnCompleted(method: string): boolean {
  return method.toLowerCase() === "turn/completed";
}

export function codexTurnId(params: unknown): string | null {
  if (typeof params !== "object" || params === null) return null;
  const turn = (params as Record<string, unknown>).turn;
  if (typeof turn !== "object" || turn === null) return null;
  const id = (turn as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}
