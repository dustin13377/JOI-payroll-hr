import { describe, it, expect } from "vitest";
import {
  needsFollowUp,
  isFollowUpLocked,
  followUpUnlockAt,
  FOLLOWUP_AFTER_HOURS,
} from "./followup";

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

describe("isFollowUpLocked", () => {
  it("is locked inside the 48h window", () => {
    expect(isFollowUpLocked(hoursAgo(FOLLOWUP_AFTER_HOURS - 1))).toBe(true);
    expect(isFollowUpLocked(hoursAgo(1))).toBe(true);
  });

  it("unlocks once the window passes", () => {
    expect(isFollowUpLocked(hoursAgo(FOLLOWUP_AFTER_HOURS + 1))).toBe(false);
  });

  it("is not locked when there's no contact timestamp to count from", () => {
    expect(isFollowUpLocked(null)).toBe(false);
  });
});

describe("followUpUnlockAt", () => {
  it("returns 48h after last contact", () => {
    const contacted = new Date("2026-07-13T00:00:00.000Z").toISOString();
    const unlock = followUpUnlockAt(contacted);
    expect(unlock?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("returns null without a timestamp", () => {
    expect(followUpUnlockAt(null)).toBeNull();
  });
});
