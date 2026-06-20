import { describe, it, expect } from "vitest";
import { computeNetPay, classifyOffDays, OVERTIME_DAY_PAY } from "./payrollEngine";

describe("computeNetPay — base & daily", () => {
  it("base = monthly / 2 (quincenal), no adjustments", () => {
    const r = computeNetPay({ monthlyBase: 12000 });
    expect(r.base).toBe(6000);
    expect(r.daily).toBe(400);
    expect(r.net).toBe(6000);
  });
  it("handles 18k and 23k", () => {
    expect(computeNetPay({ monthlyBase: 18000 }).base).toBe(9000);
    expect(computeNetPay({ monthlyBase: 23000 }).base).toBe(11500);
  });
});

describe("computeNetPay — missed, makeup, overtime", () => {
  it("missed days are docked at the daily rate", () => {
    const r = computeNetPay({ monthlyBase: 12000, missedDays: 3 });
    expect(r.missedDeduction).toBe(1200); // 3 × 400
    expect(r.net).toBe(4800);
  });
  it("makeup days credit the daily rate back (no $1,000)", () => {
    // Carlos period 1: missed whole week (4), worked 2 Fridays so far
    const r = computeNetPay({ monthlyBase: 12000, missedDays: 4, makeupDays: 2 });
    expect(r.missedDeduction).toBe(1600);
    expect(r.makeupCredit).toBe(800);
    expect(r.overtimePay).toBe(0);
    expect(r.net).toBe(5200); // 6000 − 1600 + 800
  });
  it("makeup carries: period 2 just credits the remaining days", () => {
    // Carlos period 2: no misses this period, 2 more makeup Fridays
    const r = computeNetPay({ monthlyBase: 12000, makeupDays: 2 });
    expect(r.net).toBe(6800); // 6000 + 800
  });
  it("overtime pays $1,000 per extra off-day worked", () => {
    const r = computeNetPay({ monthlyBase: 23000, overtimeDays: 4 });
    expect(r.overtimePay).toBe(4 * OVERTIME_DAY_PAY);
    expect(r.net).toBe(11500 + 4000);
  });
});

describe("computeNetPay — Sunday, vacation, spiff", () => {
  it("Sunday premium = 25% of daily per Sunday worked", () => {
    const r = computeNetPay({ monthlyBase: 12000, sundaysWorked: 1 });
    expect(r.sundayPay).toBe(100); // 0.25 × 400
  });
  it("vacation adds 25% premium (base already pays the day)", () => {
    const r = computeNetPay({ monthlyBase: 18000, vacationDays: 2 });
    expect(r.vacationPremium).toBe(300); // 0.25 × 600 × 2
    expect(r.net).toBe(9300);
  });
  it("spiffs convert USD → MXN at 17 by default", () => {
    const r = computeNetPay({ monthlyBase: 18000, spiffUsd: 11 });
    expect(r.spiffMxn).toBe(187); // 11 × 17
    expect(r.net).toBe(9187);
  });
  it("respects a custom exchange rate", () => {
    expect(computeNetPay({ monthlyBase: 12000, spiffUsd: 10, exchangeRate: 18 }).spiffMxn).toBe(180);
  });
});

describe("computeNetPay — full real examples (match approved mock)", () => {
  it("Deysi: weekend + 4 overtime + 2 Sundays + $18 spiff", () => {
    const r = computeNetPay({ monthlyBase: 23000, overtimeDays: 4, sundaysWorked: 2, spiffUsd: 18 });
    expect(r.net).toBe(16189.33); // 11500 + 4000 + 383.33 + 306
  });
  it("Jesse: weekend, missed 3, 1 Sunday worked, no makeup", () => {
    const r = computeNetPay({ monthlyBase: 12000, missedDays: 3, sundaysWorked: 1 });
    expect(r.net).toBe(4900); // 6000 − 1200 + 100
  });
});

describe("classifyOffDays — makeup vs overtime", () => {
  it("covers misses first, rest is overtime", () => {
    expect(classifyOffDays(3, 5)).toEqual({ makeupDays: 3, overtimeDays: 2 });
  });
  it("all overtime when no misses", () => {
    expect(classifyOffDays(0, 4)).toEqual({ makeupDays: 0, overtimeDays: 4 });
  });
  it("partial makeup when they only make up some", () => {
    expect(classifyOffDays(4, 1)).toEqual({ makeupDays: 1, overtimeDays: 0 });
  });
  it("no off-days worked = nothing", () => {
    expect(classifyOffDays(4, 0)).toEqual({ makeupDays: 0, overtimeDays: 0 });
  });
});
