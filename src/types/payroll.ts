/**
 * payroll.ts — Phase 2 TypeScript port of Joe's calcAgentPay_() formula.
 *
 * Two surfaces:
 *   previewPay(inputs, employee)   — client-side mirror; instant UI preview,
 *                                    no round-trip needed.
 *   calculatePay(recordId)         — calls the pay_calc_record() Supabase RPC;
 *                                    the authoritative write that persists to DB.
 *
 * Source of truth: JOI_PAYROLL_CLEAN.js calcAgentPay_() line 885.
 * This file must stay in sync with 20260519000005_payroll_phase2_calc_engine.sql.
 */

import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EmpTitle = 'owner' | 'admin' | 'manager' | 'team_lead' | 'agent';

/** Minimal employee shape needed by the calc engine (mirrors employees table).
 *  Phase 4b simplification: only monthly_base_salary + kpi_bonus_amount are
 *  read by the calc. Daily = monthly / 30 (LFT convention); quincena base = monthly / 2.
 *  Legacy fields kept optional for compatibility; calc ignores them. */
export interface PayEmployee {
  id: string;
  monthly_base_salary:   number;   // source of truth
  kpi_bonus_amount:      number;
  weekly_base_salary?:   number;   // legacy — no longer read by calc
  daily_salary?:         number;   // legacy — no longer read by calc
  daily_discount_rate?:  number;   // legacy — no longer read by calc
  overtime_day_pay?:     number;   // legacy — no longer read by calc
  sunday_bonus_amount?:  number;   // legacy — no longer read by calc
  vacation_premium_pct?: number;   // legacy — no longer read by calc
}

/** Input fields — mirrors the payroll_records input columns. */
export interface PayInputs {
  include_in_payroll:  boolean;
  missed_days:         number;
  overtime_days:       number;
  sundays_worked:      number;
  vacation_days:       number;
  holiday_days:        number;
  kpi_achieved:        boolean;
  extra_bonus:         number;
  partial_week_days:   number | null;  // null = full week
  custom_deduction:    number;          // manager-entered extra deduction
}

/** Calculated breakdown — mirrors the payroll_records calc columns. */
export interface PayComponents {
  weekly_base:       number;
  kpi_bonus:         number;
  missed_deduction:  number;
  overtime_pay:      number;
  sunday_pay:        number;
  vacation_pay:      number;
  holiday_pay:       number;
  total_pay:         number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rounding helper
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 2 decimal places (matches Postgres round(x::numeric, 2)). */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// previewPay — client-side mirror of _calc_pay_components
//
// Use this for instant UI feedback (e.g., updating a running total as the
// manager edits inputs).  The numbers must match what the DB will produce;
// if they ever diverge, fix both files.
// ─────────────────────────────────────────────────────────────────────────────

export function previewPay(inputs: PayInputs, emp: PayEmployee): PayComponents {
  // Branch B: not included in payroll
  if (!inputs.include_in_payroll) {
    return {
      weekly_base: 0, kpi_bonus: 0, missed_deduction: 0,
      overtime_pay: 0, sunday_pay: 0, vacation_pay: 0,
      holiday_pay: 0, total_pay: 0,
    };
  }

  // Derive daily from monthly. Source of truth = employees.monthly_base_salary.
  // (LFT convention: monthly / 30). If unset, calc yields zero.
  const monthly = emp.monthly_base_salary ?? 0;
  const daily   = monthly / 30;

  // Components common to both partial-week and full-week branches
  const kpi_bonus    = inputs.kpi_achieved ? (emp.kpi_bonus_amount ?? 0) : 0;
  const overtime_pay = 0;                                              // Phase 4b: OT handled via extra_bonus
  const sunday_pay   = r2(inputs.sundays_worked * daily * 0.25);       // LFT Art. 79
  const holiday_pay  = r2(inputs.holiday_days   * daily * 2);          // LFT Art. 75
  const vacation_pay = 0;                                              // Phase 4b: deferred to new-entity work
  const custom_ded   = inputs.custom_deduction ?? 0;

  // Branch C: partial week (mid-week hire)
  if (inputs.partial_week_days !== null && inputs.partial_week_days > 0) {
    const weekly_base = r2(daily * inputs.partial_week_days);
    const total_pay   = r2(weekly_base + kpi_bonus + overtime_pay
                           + sunday_pay + holiday_pay
                           + inputs.extra_bonus - custom_ded);
    return {
      weekly_base, kpi_bonus,
      missed_deduction: 0,
      overtime_pay, sunday_pay,
      vacation_pay: 0,
      holiday_pay, total_pay,
    };
  }

  // Branch D: full period
  // Quincenal base = monthly / 2 (Task 1: cadence fix; everyone is paid 1st–15th
  // and 16th–end). Must match _calc_pay_components in the SQL migration.
  const weekly_base      = r2(monthly / 2);
  const missed_deduction = r2(inputs.missed_days * daily);
  const total_pay        = r2(weekly_base - missed_deduction - custom_ded
                               + kpi_bonus + overtime_pay + sunday_pay
                               + vacation_pay + holiday_pay
                               + inputs.extra_bonus);
  return {
    weekly_base, kpi_bonus, missed_deduction,
    overtime_pay, sunday_pay, vacation_pay, holiday_pay, total_pay,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// calculatePay — calls pay_calc_record() RPC (the authoritative DB write)
//
// Throws on PAID rows (server raises 23514).
// Returns the updated PayComponents so the UI can refresh without a re-fetch.
// ─────────────────────────────────────────────────────────────────────────────

export async function calculatePay(recordId: string): Promise<void> {
  const { error } = await supabase.rpc('pay_calc_record', {
    p_record_id: recordId,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy type shims — kept for import compatibility only.
// The old calcularNomina() is gone; anything still calling it needs to migrate
// to previewPay() + calculatePay().
// ─────────────────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  nombre: string;
  sueldoBase: number;
  descuentoPorDia: number;
  kpiMonto: number;
  title?: EmpTitle;
  reportsTo?: string | null;
  _uuid?: string;
}

/** Employee with metadata fields populated by mapEmployee (from DB joins). */
export interface EmployeeWithMeta extends Employee {
  _campaignId?: string;
  _campaignName?: string;
  _curp?: string | null;
  _rfc?: string | null;
  _address?: string | null;
  _phone?: string | null;
  _bankClabe?: string | null;
  _complianceGraceUntil?: string | null;
  _workName?: string | null;
  _personalEmail?: string | null;
  _email?: string | null;
  _hireDate?: string | null;
  _emergencyContact?: string | null;
  _bankName?: string | null;
  _dateOfBirth?: string | null;
  _maritalStatus?: string | null;
  _nss?: string | null;
  _lastWorkedDay?: string | null;
  _departmentId?: string | null;
  _departmentName?: string | null;
  // Recruiting linkage — populated when this employee was hired from a
  // recruiting_candidates row via the "Hire as employee" flow.
  _cvUrl?: string | null;
  _introRecordingUrl?: string | null;
  _recruitedFromCandidateId?: string | null;
}

/** @deprecated Use PayInputs + previewPay() instead. */
export interface PayrollConfig {
  empleadoId: string;
  diasFaltados: number;
  kpiAplicado: boolean;
  diasExtra: number;
  primaDominical: boolean;
  diaFestivo: boolean;
  bonosAdicionales: number;
}

/** @deprecated Use PayComponents instead. */
export interface PayrollResult {
  sueldoQuincenal: number;
  sueldoDiario: number;
  descuentoFaltas: number;
  montoKpi: number;
  montoDiasExtra: number;
  montoPrimaDominical: number;
  montoDiaFestivo: number;
  bonosAdicionales: number;
  totalExtras: number;
  totalRetenciones: number;
  netoAPagar: number;
}

/** @deprecated Use PayComponents instead. */
export interface PayrollRecord {
  id: string;
  periodo: string;
  fechaCierre: string;
  empleadoId: string;
  empleadoNombre: string;
  config: PayrollConfig;
  result: PayrollResult;
  sueldoBase: number;
}

/**
 * @deprecated calcularNomina() used a biweekly formula (sueldoBase/2), a
 * hardcoded $1,000 overtime rate, and wrong Sunday premium math.  It is
 * replaced by previewPay() + calculatePay().  Calling this function throws
 * so callers are easy to find during the migration.
 */
export function calcularNomina(_emp: Employee, _config: PayrollConfig): PayrollResult {
  throw new Error(
    'calcularNomina() is removed. Use previewPay(inputs, employee) for ' +
    'client-side preview or calculatePay(recordId) for the DB write. ' +
    'See src/types/payroll.ts for the new API.'
  );
}

/**
 * All-zeros PayrollResult — safe placeholder for legacy pages still expecting
 * this shape. Real per-employee net pay lives at /admin/payroll/agent/:id now.
 * To be removed in Phase 4c once the legacy callers are migrated.
 */
export const EMPTY_PAYROLL_RESULT: PayrollResult = {
  sueldoQuincenal: 0,
  sueldoDiario: 0,
  descuentoFaltas: 0,
  montoKpi: 0,
  montoDiasExtra: 0,
  montoPrimaDominical: 0,
  montoDiaFestivo: 0,
  bonosAdicionales: 0,
  totalExtras: 0,
  totalRetenciones: 0,
  netoAPagar: 0,
};
