import { describe, it, expect } from "vitest";
import { STAGES, isTerminal, isValidTransition, STAGE_LABELS } from "./stages";

describe("stages", () => {
  it("exposes all 13 stages", () => {
    expect(STAGES).toHaveLength(13);
  });

  it("identifies terminal stages", () => {
    expect(isTerminal("hired")).toBe(true);
    expect(isTerminal("passed")).toBe(true);
    expect(isTerminal("withdrew")).toBe(true);
    expect(isTerminal("ghosted")).toBe(true);
    expect(isTerminal("no_show")).toBe(true);
    expect(isTerminal("offer")).toBe(false);
    expect(isTerminal("warm_hold")).toBe(false);
    expect(isTerminal("new")).toBe(false);
  });

  it("allows reaching offer from interview/hold stages", () => {
    expect(isValidTransition("interviewed", "offer")).toBe(true);
    expect(isValidTransition("warm_hold", "offer")).toBe(true);
    expect(isValidTransition("reactivated", "offer")).toBe(true);
  });

  it("allows an offer to resolve to hired or no_show", () => {
    expect(isValidTransition("offer", "hired")).toBe(true);
    expect(isValidTransition("offer", "no_show")).toBe(true);
  });

  it("does not escape a no_show", () => {
    expect(isValidTransition("no_show", "offer")).toBe(false);
    expect(isValidTransition("no_show", "hired")).toBe(false);
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
