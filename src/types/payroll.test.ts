import { describe, it, expect, vi } from "vitest";

// payroll.ts imports the Supabase client at module load, which throws if the
// VITE_SUPABASE_* env vars are missing. We only test the pure previewPay()
// function here, so stub the client module.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { previewPay, type PayInputs, type PayEmployee } from "@/types/payroll";

const emp = (monthly: number, kpi = 0): PayEmployee => ({
  id: "emp-test",
  monthly_base_salary: monthly,
  kpi_bonus_amount: kpi,
});

const inputs = (over: Partial<PayInputs> = {}): PayInputs => ({
  include_in_payroll: true,
  missed_days: 0,
  overtime_days: 0,
  sundays_worked: 0,
  vacation_days: 0,
  holiday_days: 0,
  kpi_achieved: false,
  extra_bonus: 0,
  partial_week_days: null,
  custom_deduction: 0,
  ...over,
});

describe("previewPay — quincenal cadence (Task 1)", () => {
  it("full-period base = monthly / 2", () => {
    const r = previewPay(inputs(), emp(18000));
    expect(r.weekly_base).toBe(9000);
    expect(r.total_pay).toBe(9000);
  });

  it("matches 15k and 12k salaries", () => {
    expect(previewPay(inputs(), emp(15000)).weekly_base).toBe(7500);
    expect(previewPay(inputs(), emp(12000)).weekly_base).toBe(6000);
  });

  it("missed days deducted at daily rate (monthly / 30)", () => {
    const r = previewPay(inputs({ missed_days: 2 }), emp(18000));
    expect(r.missed_deduction).toBe(1200); // 2 × 600
    expect(r.total_pay).toBe(7800); // 9000 − 1200
  });

  it("Sunday premium = 25% of daily rate (prima dominical)", () => {
    const r = previewPay(inputs({ sundays_worked: 2 }), emp(18000));
    expect(r.sunday_pay).toBe(300); // 2 × 600 × 0.25
    expect(r.total_pay).toBe(9300); // 9000 + 300
  });

  it("KPI bonus applies only when achieved", () => {
    expect(previewPay(inputs({ kpi_achieved: false }), emp(18000, 1000)).kpi_bonus).toBe(0);
    expect(previewPay(inputs({ kpi_achieved: true }), emp(18000, 1000)).kpi_bonus).toBe(1000);
  });

  it("partial period = daily × days worked (no full half-month)", () => {
    const r = previewPay(inputs({ partial_week_days: 8 }), emp(18000));
    expect(r.weekly_base).toBe(4800); // 8 × 600
    expect(r.missed_deduction).toBe(0);
  });

  it("excluded from payroll → all zero", () => {
    const r = previewPay(inputs({ include_in_payroll: false }), emp(18000));
    expect(r.total_pay).toBe(0);
    expect(r.weekly_base).toBe(0);
  });
});
