import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Employee, EmployeeWithMeta, PayrollConfig, PayrollResult } from "@/types/payroll";
import { calcularNomina } from "@/types/payroll";

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
    _hireDate: row.hire_date ?? null,
    _emergencyContact: row.emergency_contact ?? null,
    _bankName: row.bank_name ?? null,
    _dateOfBirth: row.date_of_birth ?? null,
    _maritalStatus: row.marital_status ?? null,
    _nss: row.nss ?? null,
    _lastWorkedDay: row.last_worked_day ?? null,
    _departmentId: row.department_id ?? null,
    _departmentName: row.departments?.name ?? null,
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
    mutationFn: async (emp: Omit<Employee, "_uuid" | "id"> & { campaignId?: string | null; email?: string | null }) => {
      if (emp.email) {
        // Use edge function for atomic auth user + employee + profile creation
        const { data, error } = await supabase.functions.invoke("create-employee", {
          body: {
            email: emp.email,
            full_name: emp.nombre,
            campaign_id: emp.campaignId ?? null,
            title: emp.title ?? "agent",
            monthly_base_salary: emp.sueldoBase,
            daily_discount_rate: emp.descuentoPorDia,
            kpi_bonus_amount: emp.kpiMonto,
          },
        });
        if (error) throw error;
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

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, data }: { employeeId: string; data: Partial<EmployeeWithMeta> & { curp?: string; rfc?: string; address?: string; phone?: string; bank_clabe?: string; compliance_grace_until?: string | null; work_name?: string; personal_email?: string; hire_date?: string | null; emergency_contact?: string; bank_name?: string; date_of_birth?: string | null; marital_status?: string; nss?: string; last_worked_day?: string | null; department_id?: string | null } }) => {
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

export function useCreatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (period: { start_date: string; end_date: string; period_type: string }) => {
      const { data, error } = await supabase
        .from("payroll_periods")
        .insert(period)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activePeriod"] }),
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
