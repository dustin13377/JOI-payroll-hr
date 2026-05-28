import { describe, it, expect } from "vitest";
import { STAGES, isTerminal, isValidTransition, STAGE_LABELS } from "./stages";

describe("stages", () => {
  it("exposes all 10 stages", () => {
    expect(STAGES).toHaveLength(10);
  });

  it("identifies terminal stages", () => {
    expect(isTerminal("hired")).toBe(true);
    expect(isTerminal("passed")).toBe(true);
    expect(isTerminal("withdrew")).toBe(true);
    expect(isTerminal("ghosted")).toBe(true);
    expect(isTerminal("warm_hold")).toBe(false);
    expect(isTerminal("new")).toBe(false);
  });

  it("allows forward transition new → triaged", () => {
    expect(isValidTransition("new", "triaged")).toBe(true);
  });

  it("disallows backward transition triaged → new", () => {
    expect(isValidTransition("triaged", "new")).toBe(false);
  });

  it("allows any stage → terminal", () => {
    expect(isValidTransition("new", "passed")).toBe(true);
    expect(isValidTransition("warm_hold", "ghosted")).toBe(true);
    expect(isValidTransition("interview_scheduled", "withdrew")).toBe(true);
  });

  it("disallows transition out of terminal", () => {
    expect(isValidTransition("hired", "warm_hold")).toBe(false);
    expect(isValidTransition("passed", "new")).toBe(false);
  });

  it("has a human-readable label for every stage", () => {
    for (const s of STAGES) {
      expect(STAGE_LABELS[s]).toBeTruthy();
    }
  });
});
