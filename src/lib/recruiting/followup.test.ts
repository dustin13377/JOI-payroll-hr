import { describe, it, expect } from "vitest";
import { needsFollowUp, FOLLOWUP_AFTER_HOURS } from "./followup";

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

describe("needsFollowUp", () => {
  it("is true for a contacted candidate past the threshold", () => {
    expect(needsFollowUp("contacted", hoursAgo(FOLLOWUP_AFTER_HOURS + 1))).toBe(true);
  });

  it("is false when contacted too recently", () => {
    expect(needsFollowUp("contacted", hoursAgo(FOLLOWUP_AFTER_HOURS - 1))).toBe(false);
  });

  it("is false when never contacted", () => {
    expect(needsFollowUp("contacted", null)).toBe(false);
  });

  it("is false for stages other than contacted, even if overdue", () => {
    expect(needsFollowUp("new", hoursAgo(200))).toBe(false);
    expect(needsFollowUp("interview_scheduled", hoursAgo(200))).toBe(false);
    expect(needsFollowUp("hired", hoursAgo(200))).toBe(false);
    expect(needsFollowUp("ghosted", hoursAgo(200))).toBe(false);
  });
});
