import { describe, expect, it } from "vitest";
import { codexTurnId, isCodexTurnCompleted, isCodexTurnStarted } from "./codexEvents";

describe("Codex turn lifecycle events", () => {
  it("finishes a turn only for turn/completed", () => {
    expect(isCodexTurnCompleted("turn/completed")).toBe(true);
    expect(isCodexTurnCompleted("TURN/COMPLETED")).toBe(true);
    expect(isCodexTurnCompleted("item/completed")).toBe(false);
    expect(isCodexTurnCompleted("hook/completed")).toBe(false);
    expect(isCodexTurnCompleted("turn/failed")).toBe(false);
  });

  it("recognizes turn/started and extracts its turn id", () => {
    expect(isCodexTurnStarted("turn/started")).toBe(true);
    expect(isCodexTurnStarted("item/started")).toBe(false);
    expect(codexTurnId({ turn: { id: "turn-123" } })).toBe("turn-123");
    expect(codexTurnId({ turn: {} })).toBeNull();
    expect(codexTurnId(null)).toBeNull();
  });
});
