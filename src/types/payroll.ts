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

/** Minimal employee shape needed by the calc engine (mirrors employees table). */
export interface PayEmployee {
  id: string;
  weekly_base_salary:    number;   // rule.weeklyBase
  daily_salary:          number;   // rule.dailySalary
  kpi_bonus_amount:      number;   // rule.kpiBonus
  daily_discount_rate:   number;   // rule.missedDed
  overtime_day_pay:      number;   // rule.overtimePay
  sunday_bonus_amount:   number;   // rule.sundayBonus
  vacation_premium_pct:  number;   // rule.vacationPct (e.g. 0.25)
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

  // Shared components
  const kpi_bonus    = inputs.kpi_achieved ? emp.kpi_bonus_amount : 0;
  const overtime_pay = r2(inputs.overtime_days  * emp.overtime_day_pay);
  const sunday_pay   = r2(inputs.sundays_worked * emp.sunday_bonus_amount);
  // LFT Art. 75: extra premium only (base day already in weekly_base)
  const holiday_pay  = r2(inputs.holiday_days * emp.daily_salary * 2);

  // Branch C: partial week
  if (inputs.partial_week_days !== null && inputs.partial_week_days > 0) {
    const weekly_base = r2(emp.daily_salary * inputs.partial_week_days);
    const total_pay   = r2(weekly_base + kpi_bonus + overtime_pay
                           + sunday_pay + holiday_pay + inputs.extra_bonus);
    return {
      weekly_base, kpi_bonus,
      missed_deduction: 0,
      overtime_pay, sunday_pay,
      vacation_pay: 0,
      holiday_pay, total_pay,
    };
  }

  // Branch D: full week
  const weekly_base      = emp.weekly_base_salary;  // already numeric(12,2) in DB
  const missed_deduction = r2(inputs.missed_days    * emp.daily_discount_rate);
  const vacation_pay     = r2(inputs.vacation_days  * emp.daily_salary
                               * (1 + emp.vacation_premium_pct));
  const total_pay        = r2(weekly_base - missed_deduction + kpi_bonus
                               + overtime_pay + sunday_pay + vacation_pay
                               + holiday_pay + inputs.extra_bonus);
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
