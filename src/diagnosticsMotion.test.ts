import { describe, expect, it } from "vitest";
import { diagnosticsTurnDuration, shouldRequestDiagnostics } from "./diagnosticsMotion";

describe("diagnosticsTurnDuration", () => {
  it("uses 600 ms for a single remaining turn", () => {
    expect(diagnosticsTurnDuration(1)).toBe(600);
  });

  it("accelerates with the remaining turn count", () => {
    expect(diagnosticsTurnDuration(2)).toBeLessThan(600);
    expect(diagnosticsTurnDuration(40)).toBeLessThan(diagnosticsTurnDuration(20));
  });

  it("reaches and keeps the 120 ms limit at about 82 turns", () => {
    expect(diagnosticsTurnDuration(81)).toBe(121);
    expect(diagnosticsTurnDuration(82)).toBe(120);
    expect(diagnosticsTurnDuration(200)).toBe(120);
  });

  it("normalizes invalid counts to a single turn", () => {
    expect(diagnosticsTurnDuration(0)).toBe(600);
    expect(diagnosticsTurnDuration(Number.NaN)).toBe(600);
  });
});

describe("shouldRequestDiagnostics", () => {
  it("does not repeat diagnostics while one is running", () => {
    expect(shouldRequestDiagnostics(false, 1)).toBe(false);
  });

  it("uses rapid-mode clicks only for queued rotations", () => {
    expect(shouldRequestDiagnostics(true, 0)).toBe(false);
  });

  it("allows an ordinary idle refresh", () => {
    expect(shouldRequestDiagnostics(false, 0)).toBe(true);
  });
});
