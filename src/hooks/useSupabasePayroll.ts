import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Employee, EmployeeWithMeta, PayrollConfig, PayrollResult } from "@/types/payroll";
import { calcularNomina } from "@/types/payroll";
import { edgeErrorMessage } from "@/lib/edge";

// Map DB row to frontend Employee
function mapEmployee(row: any): EmployeeWithMeta {
  return {
    id: row.employee_id,
    nombre: row.full_name,
    sueldoBase: Number(row.monthly_base_salary) || 0,
    descuentoPorDia: Number(row.daily_discount_rate) || 0,
    kpiMonto: Number(row.kpi_bonus_amount) || 0,
    title: row.title || "agent",
    reportsTo: row.reports_to || null,
    _uuid: row.id,
    _campaignId: row.campaign_id || undefined,
    _campaignName: row.campaigns?.name || undefined,
    _curp: row.curp ?? null,
    _rfc: row.rfc ?? null,
    _address: row.address ?? null,
    _phone: row.phone ?? null,
    _bankClabe: row.bank_clabe ?? null,
    _complianceGraceUntil: row.compliance_grace_until ?? null,
    // A1b: expanded employee record
    _workName: row.work_name ?? null,
    _personalEmail: row.personal_email ?? null,
    _email: row.email ?? null,
    _hireDate: row.hire_date ?? null,
    _emergencyContact: row.emergency_contact ?? null,
    _bankName: row.bank_name ?? null,
    _dateOfBirth: row.date_of_birth ?? null,
    _maritalStatus: row.marital_status ?? null,
    _nss: row.nss ?? null,
    _lastWorkedDay: row.last_worked_day ?? null,
    _departmentId: row.department_id ?? null,
    _departmentName: row.departments?.name ?? null,
    _cvUrl: row.cv_url ?? null,
    _introRecordingUrl: row.intro_recording_url ?? null,
    _recruitedFromCandidateId: row.recruited_from_candidate_id ?? null,
  };
}

// =================== EMPLOYEES ===================

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, campaigns!employees_campaign_id_fkey(name), departments(name)")
        .eq("is_active", true)
        .eq("is_system_user", false)  // hide partners/auditors from payroll/HR lists; they live on /admin/system-users
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map(mapEmployee);
    },
  });
}

export function useAddEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      emp: Omit<Employee, "_uuid" | "id"> & {
        campaignId?: string | null;
        email?: string | null;
        personalEmail?: string | null;
        // Optional fields used by the "hire from candidate" flow:
        curp?: string | null;
        phone?: string | null;
        cvUrl?: string | null;
        introRecordingUrl?: string | null;
        recruitedFromCandidateId?: string | null;
        hireDate?: string | null;
      },
    ) => {
      if (emp.email) {
        // Use edge function for atomic auth user + employee + profile creation
        const { data, error } = await supabase.functions.invoke("create-employee", {
          body: {
            email: emp.email,
            personal_email: emp.personalEmail ?? null,
            full_name: emp.nombre,
            campaign_id: emp.campaignId ?? null,
            title: emp.title ?? "agent",
            monthly_base_salary: emp.sueldoBase,
            daily_discount_rate: emp.descuentoPorDia,
            kpi_bonus_amount: emp.kpiMonto,
            curp: emp.curp ?? null,
            phone: emp.phone ?? null,
            cv_url: emp.cvUrl ?? null,
            intro_recording_url: emp.introRecordingUrl ?? null,
            recruited_from_candidate_id: emp.recruitedFromCandidateId ?? null,
            hire_date: emp.hireDate ?? null,
          },
        });
        if (error) throw new Error(await edgeErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        return { employee_id: data.employee_id as string };
      }
      // Fallback: no email, just create employee row
      const { data, error } = await supabase.from("employees").insert({
        full_name: emp.nombre,
        monthly_base_salary: emp.sueldoBase,
        daily_discount_rate: emp.descuentoPorDia,
        kpi_bonus_amount: emp.kpiMonto,
        title: emp.title ?? "agent",
        campaign_id: emp.campaignId ?? null,
        curp: emp.curp ?? null,
        phone: emp.phone ?? null,
        cv_url: emp.cvUrl ?? null,
        intro_recording_url: emp.introRecordingUrl ?? null,
        recruited_from_candidate_id: emp.recruitedFromCandidateId ?? null,
        hire_date: emp.hireDate ?? null,
      }).select("employee_id").single();
      if (error) throw error;
      return data as { employee_id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useAddEmployeesBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (emps: Omit<Employee, "_uuid">[]) => {
      const rows = emps.map((e) => ({
        employee_id: e.id,
        full_name: e.nombre,
        monthly_base_salary: e.sueldoBase,
        daily_discount_rate: e.descuentoPorDia,
        kpi_bonus_amount: e.kpiMonto,
      }));
      const { error } = await supabase.from("employees").upsert(rows, {
        onConflict: "employee_id",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

// Read the current agent's personal goal + prompt-dismissed flag.
// Used to decide whether to show the first-login goal prompt and to display
// the goal on their profile/dashboard.
export function useMyGoal(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-goal", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("personal_goal, goal_set_at, goal_visible_to_tl, goal_prompt_dismissed")
        .eq("id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        personal_goal: string | null;
        goal_set_at: string | null;
        goal_visible_to_tl: boolean;
        goal_prompt_dismissed: boolean;
      } | null;
    },
    enabled: !!employeeId,
  });
}

// Update the current agent's personal goal. Calls the update_my_goal RPC
// because RLS on public.employees has no UPDATE policy for agents on their
// own row (a direct .update() returns success with 0 rows affected and the
// prompt re-opens forever — see migration update_my_goal_rpc).
// The employee_id input is kept for callsite ergonomics but the RPC ignores
// it and uses my_employee_id() server-side, so an agent can only ever write
// their own row.
export function useUpdateMyGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      personal_goal?: string | null;
      goal_visible_to_tl?: boolean;
      dismiss_prompt?: boolean; // true when the user clicks "skip" on the first-login dialog
    }) => {
      const clearGoal = input.personal_goal === null;
      // Cast: types.ts hasn't been regenerated to include this RPC yet.
      // Run `npx supabase gen types typescript` to remove the cast.
      const { error } = await (supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>)("update_my_goal", {
        p_personal_goal: input.personal_goal ?? null,
        p_goal_visible_to_tl:
          input.goal_visible_to_tl === undefined ? null : input.goal_visible_to_tl,
        p_dismiss: input.dismiss_prompt ?? false,
        p_clear_goal: clearGoal,
      });
      if (error) throw error as Error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-goal"] });
    },
  });
}

// Change an employee's role (title) and keep user_profiles.role in sync.
// Wraps the change_employee_role RPC which handles the title + nudge dance
// (see feedback_role_change_via_title memory).
export function useChangeEmployeeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      new_title: "agent" | "team_lead" | "manager" | "admin" | "owner";
    }) => {
      const { data, error } = await supabase.rpc("change_employee_role", {
        p_employee_id: input.employee_id,
        p_new_title: input.new_title,
      });
      if (error) throw error;
      return data as {
        employee_id: string;
        old_title: string;
        new_title: string;
        auth_user_synced: boolean;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee_profile"] });
    },
  });
}

// Edit / create a time_clock row via the edit-time-clock edge function.
// Used by HR / TL / manager to fix missing or wrong punches with an audit trail.
export function useEditTimeClock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      date: string;            // YYYY-MM-DD
      reason: string;          // required, min 3 chars
      clock_in?: string | null;
      clock_out?: string | null;
      lunch_start?: string | null;
      lunch_end?: string | null;
      break1_start?: string | null;
      break1_end?: string | null;
      break2_start?: string | null;
      break2_end?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("edit-time-clock", {
        body: input,
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data as {
        time_clock: Record<string, unknown>;
        audit_id: string;
        action: "insert" | "update";
        warning?: string;
      };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["time_clock"] });
      // HomeHero stat row + today-status are keyed by the punch-owner's
      // employee_id, not the editor. Without these, fixing someone's punch
      // (e.g. TL clocks in a no-email agent, or back-fills a missed
      // clock-out) leaves their dashboard stale until next focus.
      qc.invalidateQueries({ queryKey: ["home-hero-today", vars.employee_id] });
      qc.invalidateQueries({ queryKey: ["home-hero-week", vars.employee_id] });
      qc.invalidateQueries({ queryKey: ["team-timeclock-today"] });
    },
  });
}

// Resend the "Welcome to JOI" invite email to one or more existing employees.
// Internally handles stale auth users + user_profiles linkage so role guards work.
//
// Accepts an array of employee row UUIDs (employees.id, not employee_id text).
// Returns per-employee status: sent | skipped | error.
export function useResendInvite() {
  return useMutation({
    mutationFn: async (employeeIds: string[]) => {
      if (!employeeIds.length) throw new Error("No employees selected");
      const { data, error } = await supabase.functions.invoke("resend-invite", {
        body: { employee_ids: employeeIds },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data as {
        results: Array<{
          employee_id: string;
          email: string | null;
          full_name: string | null;
          status: "sent" | "skipped" | "error";
          message?: string;
          auth_user_id?: string;
        }>;
      };
    },
  });
}

/**
 * Update the 5 whitelisted contact fields via the SECURITY DEFINER RPC.
 * Used by TLs (for their team) and agents (self-edit). Leadership can use
 * either this or useUpdateEmployee — same result, but useUpdateEmployee
 * also supports the wider field set leadership has access to.
 *
 * Pass NULL for a field you want left alone. Pass '' to clear it.
 */
export function useUpdateEmployeePersonalInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employeeUuid: string;
      work_name?: string | null;
      personal_email?: string | null;
      phone?: string | null;
      address?: string | null;
      emergency_contact?: string | null;
    }) => {
      const { error } = await supabase.rpc("update_employee_personal_info", {
        p_employee_uuid: input.employeeUuid,
        p_work_name: input.work_name ?? null,
        p_personal_email: input.personal_email ?? null,
        p_phone: input.phone ?? null,
        p_address: input.address ?? null,
        p_emergency_contact: input.emergency_contact ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["tl-profile-fallback"] });
      qc.invalidateQueries({ queryKey: ["my-personal-info"] });
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, data }: { employeeId: string; data: Partial<EmployeeWithMeta> & { curp?: string; rfc?: string; address?: string; phone?: string; bank_clabe?: string; compliance_grace_until?: string | null; work_name?: string; personal_email?: string; hire_date?: string | null; emergency_contact?: string; bank_name?: string; date_of_birth?: string | null; marital_status?: string; nss?: string; last_worked_day?: string | null; department_id?: string | null; email?: string | null } }) => {
      const update: Record<string, unknown> = {};
      if (data.nombre !== undefined) update.full_name = data.nombre;
      if (data.sueldoBase !== undefined) update.monthly_base_salary = data.sueldoBase;
      if (data.descuentoPorDia !== undefined) update.daily_discount_rate = data.descuentoPorDia;
      if (data.kpiMonto !== undefined) update.kpi_bonus_amount = data.kpiMonto;
      // A1: personal & tax fields (column names match directly)
      if (data.curp !== undefined) update.curp = data.curp;
      if (data.rfc !== undefined) update.rfc = data.rfc;
      if (data.address !== undefined) update.address = data.address;
      if (data.phone !== undefined) update.phone = data.phone;
      if (data.bank_clabe !== undefined) update.bank_clabe = data.bank_clabe;
      // A3a: compliance grace deadline
      if (data.compliance_grace_until !== undefined) update.compliance_grace_until = data.compliance_grace_until;
      // A1b: expanded employee record
      if (data.work_name !== undefined) update.work_name = data.work_name;
      if (data.personal_email !== undefined) update.personal_email = data.personal_email;
      if (data.hire_date !== undefined) update.hire_date = data.hire_date;
      if (data.emergency_contact !== undefined) update.emergency_contact = data.emergency_contact;
      if (data.bank_name !== undefined) update.bank_name = data.bank_name;
      if (data.date_of_birth !== undefined) update.date_of_birth = data.date_of_birth;
      if (data.marital_status !== undefined) update.marital_status = data.marital_status;
      if (data.nss !== undefined) update.nss = data.nss;
      if (data.last_worked_day !== undefined) update.last_worked_day = data.last_worked_day;
      if (data.department_id !== undefined) update.department_id = data.department_id;
      // Work email (login). Leadership-only via UI guard. Empty string = clear.
      if (data.email !== undefined) {
        update.email = (data.email && data.email.trim().length > 0) ? data.email.trim() : null;
      }
      const { error } = await supabase
        .from("employees")
        .update(update)
        .eq("employee_id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["compliance-grace"] });
    },
  });
}

// Lifecycle status the UI exposes when offboarding.
export type EmploymentStatus = "active" | "terminated" | "resigned" | "on_leave";

export interface TerminateEmployeeInput {
  employeeId: string;                   // employees.employee_id (the readable one)
  status: Exclude<EmploymentStatus, "active">;
  reason: string;                       // short label, e.g. "No call no show"
  notes?: string;                       // longer free-text context
  rehireEligible: boolean | null;       // null = needs review
  lastWorkedDay?: string | null;        // YYYY-MM-DD
}

/**
 * Soft-delete kept for back-compat. New callers should use
 * useTerminateEmployee instead so we capture WHY + rehire eligibility.
 */
export function useRemoveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("employees")
        .update({
          employment_status: "terminated",
          // is_active is mirrored by the DB trigger; we set it here too
          // so type checks pass against older type defs.
          is_active: false,
        })
        .eq("employee_id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

/**
 * Full offboarding flow — sets status, reason, rehire flag, last worked day.
 * is_active and terminated_at/by are stamped by the DB trigger.
 */
export function useTerminateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TerminateEmployeeInput) => {
      const { error } = await supabase
        .from("employees")
        .update({
          employment_status: input.status,
          termination_reason: input.reason,
          termination_notes: input.notes ?? null,
          rehire_eligible: input.rehireEligible,
          last_worked_day: input.lastWorkedDay ?? null,
          is_active: false, // mirror; trigger will set this anyway
        })
        .eq("employee_id", input.employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["inactive-employees"] });
    },
  });
}

/**
 * Reactivate a previously terminated/resigned/on-leave employee.
 * Trigger clears terminated_at + terminated_by but keeps the reason / notes
 * / rehire flag for history.
 */
export function useReactivateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("employees")
        .update({
          employment_status: "active",
          is_active: true,
        })
        .eq("employee_id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["inactive-employees"] });
    },
  });
}

/**
 * List inactive (terminated/resigned/on_leave) employees for the offboarded
 * view. Separate query keeps the active roster fast.
 */
export function useInactiveEmployees() {
  return useQuery({
    queryKey: ["inactive-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id, employee_id, full_name, curp, rfc, date_of_birth, employment_status, termination_reason, termination_notes, rehire_eligible, terminated_at, last_worked_day, title, campaigns!employees_campaign_id_fkey(name)"
        )
        .neq("employment_status", "active")
        .order("terminated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type InactiveEmployeeRow = NonNullable<
  ReturnType<typeof useInactiveEmployees>["data"]
>[number];

/**
 * Rehire check — wraps the check_rehire RPC. Pass any of curp / name / DOB;
 * returns matching past records so the Add Employee flow can warn.
 */
export function useCheckRehire() {
  return useMutation({
    mutationFn: async (input: {
      curp?: string | null;
      fullName?: string | null;
      dateOfBirth?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("check_rehire", {
        p_curp: input.curp ?? null,
        p_full_name: input.fullName ?? null,
        p_date_of_birth: input.dateOfBirth ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// =================== PAYROLL PERIODS ===================

export function useActivePeriod() {
  return useQuery({
    queryKey: ["activePeriod"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * DISABLED 2026-06-17 — legacy period-creation path (no-op).
 *
 * The Phase 1 rework made period_code/year/month/half NOT NULL on payroll_periods,
 * but this insert only supplied start_date/end_date/period_type, so every call hit:
 *   null value in column "period_code" of relation "payroll_periods"
 *   violates not-null constraint
 *
 * Three screens (Dashboard, EmpleadoPerfil, PayrollRun) call this from an
 * auto-create useEffect on mount, and useActivePeriod() queries the old lowercase
 * status "open" (live system uses "OPEN"), so it never finds a period and the
 * broken insert fired on every visit. The whole legacy period system is dead.
 *
 * Neutered to a no-op so the dead effects can't reach the DB. Proper retirement of
 * the legacy period flow is Task 3 in docs/payroll-rework.md (Joe's rework).
 */
export function useCreatePeriod() {
  return useMutation({
    mutationFn: async (_period: { start_date: string; end_date: string; period_type: string }) => {
      console.warn(
        "[useCreatePeriod] Legacy period-creation is disabled (no-op). See docs/payroll-rework.md Task 3."
      );
      return null;
    },
  });
}

export function useClosePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string) => {
      const { error } = await supabase
        .from("payroll_periods")
        .update({ status: "closed" })
        .eq("id", periodId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activePeriod"] });
      qc.invalidateQueries({ queryKey: ["payrollRecords"] });
      qc.invalidateQueries({ queryKey: ["closedPeriods"] });
    },
  });
}

// =================== PAYROLL RECORDS ===================

export function usePayrollRecords(periodId: string | undefined) {
  return useQuery({
    queryKey: ["payrollRecords", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records")
        .select("*")
        .eq("period_id", periodId!);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpsertPayrollRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (record: {
      employee_id: string; // DB uuid
      period_id: string;
      days_absent?: number;
      extra_days_count?: number;
      kpi_achieved?: boolean;
      sunday_premium_applied?: boolean;
      holiday_worked?: boolean;
      additional_bonuses?: number;
      calculated_net_pay?: number;
      overrides_json?: Record<string, boolean>;
    }) => {
      const { error } = await supabase
        .from("payroll_records")
        .upsert(
          { ...record, updated_at: new Date().toISOString() },
          { onConflict: "employee_id,period_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["payrollRecords", vars.period_id] });
    },
  });
}

// =================== HISTORY (closed periods) ===================

export function useClosedPeriods() {
  return useQuery({
    queryKey: ["closedPeriods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("status", "closed")
        .order("end_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useHistoryRecords() {
  return useQuery({
    queryKey: ["historyRecords"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records")
        .select(`
          *,
          employees!inner(employee_id, full_name, monthly_base_salary, daily_discount_rate, kpi_bonus_amount),
          payroll_periods!inner(start_date, end_date, period_type, status)
        `)
        .eq("payroll_periods.status", "closed")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

// =================== HELPERS ===================

export function getCurrentPeriodDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  if (day <= 15) {
    return {
      start_date: `${year}-${String(month + 1).padStart(2, "0")}-01`,
      end_date: `${year}-${String(month + 1).padStart(2, "0")}-15`,
      period_type: "Q1" as const,
    };
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      start_date: `${year}-${String(month + 1).padStart(2, "0")}-16`,
      end_date: `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`,
      period_type: "Q2" as const,
    };
  }
}

export function formatPeriodLabel(period: { start_date: string; end_date: string } | null): string {
  if (!period) return "Sin periodo activo";
  const start = new Date(period.start_date + "T12:00:00");
  const end = new Date(period.end_date + "T12:00:00");
  const month = start.toLocaleString("es-MX", { month: "long" });
  const year = start.getFullYear();
  return `${start.getDate()}-${end.getDate()} ${month} ${year}`;
}

/** Build a PayrollConfig from a DB payroll_record row */
export function recordToConfig(row: any, employeeId: string): PayrollConfig {
  return {
    empleadoId: employeeId,
    diasFaltados: row?.days_absent ?? 0,
    kpiAplicado: row?.kpi_achieved ?? false,
    diasExtra: row?.extra_days_count ?? 0,
    primaDominical: row?.sunday_premium_applied ?? false,
    diaFestivo: row?.holiday_worked ?? false,
    bonosAdicionales: Number(row?.additional_bonuses) || 0,
  };
}
