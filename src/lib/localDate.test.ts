import { describe, it, expect } from "vitest";
import { formatDateMX, formatDateMXLong, formatDateUSShort } from "./localDate";

// App-wide standard is now MM/DD/YYYY (US). The legacy "MX" names delegate
// to formatDateUSShort — these tests pin that behavior.

describe("formatDateUSShort", () => {
  it("formats an ISO date string", () => {
    expect(formatDateUSShort("2026-04-12")).toBe("04/12/2026");
  });

  it("formats a Date object", () => {
    expect(formatDateUSShort(new Date(2026, 3, 12))).toBe("04/12/2026");
  });

  it("returns empty string for null", () => {
    expect(formatDateUSShort(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDateUSShort(undefined)).toBe("");
  });

  it("returns empty string for invalid string", () => {
    expect(formatDateUSShort("not-a-date")).toBe("");
  });

  it("handles leap day", () => {
    expect(formatDateUSShort("2024-02-29")).toBe("02/29/2024");
  });

  it("pads single-digit day and month", () => {
    expect(formatDateUSShort("2026-01-05")).toBe("01/05/2026");
  });
});

describe("legacy aliases", () => {
  it("formatDateMX delegates to US format", () => {
    expect(formatDateMX("2026-04-12")).toBe("04/12/2026");
  });

  it("formatDateMXLong delegates to US format", () => {
    expect(formatDateMXLong("2026-04-12")).toBe("04/12/2026");
  });
});
