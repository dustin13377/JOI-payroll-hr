import { useParams, useNavigate } from "react-router-dom";
import { useEmployees, useUpdateEmployee, useActivePeriod, usePayrollRecords, useCreatePeriod, getCurrentPeriodDates } from "@/hooks/useSupabasePayroll";
import { ChangeRoleDialog } from "@/components/ChangeRoleDialog";
import { EditNameDialog } from "@/components/EditNameDialog";
import { ClientCampaignPicker } from "@/components/ClientCampaignPicker";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edge";
import { useAuth } from "@/hooks/useAuth";
// EMPTY_PAYROLL_RESULT retired in Phase 4c — payroll card now reads from records directly
import type { EmployeeWithMeta } from "@/types/payroll";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Upload, Check, X, Eye, EyeOff, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, CalendarClock, Trash2, Plus, FileWarning, StickyNote, AlertTriangle, Pencil, Clock, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useEffect, useState, useRef } from "react";
import { useComplianceStatus } from "@/hooks/useComplianceStatus";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useAgentLogEntries, useCreateAgentLogEntry, useToggleEntryVisibility, type AgentLogEntry } from "@/hooks/useAgentLog";
import {
  useEmployeeDocuments,
  useUploadDocument,
  useReviewDocument,
  getDocumentSignedUrl,
} from "@/hooks/useEmployeeDocuments";
import { DocumentStatusBadge } from "@/components/DocumentStatusBadge";
import { ACCEPTED_DOCUMENT_TYPES, ACCEPTED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE_BYTES } from "@/lib/documentUpload";
import {
  useAgentIncidents,
  useCreateIncident,
  useUpdateIncident,
  getIncidentDocSignedUrl,
  INCIDENT_TYPE_LABELS,
  type IncidentType,
  type AttendanceIncident,
} from "@/hooks/useAttendanceIncidents";
import { usePolicies, type PolicyDocument } from "@/hooks/usePolicies";
import { useDepartments } from "@/hooks/useDepartments";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateMX } from "@/lib/localDate";
import { getDisplayName } from "@/lib/displayName";
import HrDocumentRequestsCard from "@/components/employee-profile/HrDocumentRequestsCard";
import UptrainingCard from "@/components/employee-profile/UptrainingCard";
import { EmploymentHistoryCard } from "@/components/employee-profile/EmploymentHistoryCard";
import { ThirtyDayReviewCard } from "@/components/employee-profile/ThirtyDayReviewCard";
import { PersonalInfoCard } from "@/components/employee-profile/PersonalInfoCard";
import { ClockInHistoryCard } from "@/components/employee-profile/ClockInHistoryCard";
import { CampaignHistoryCard } from "@/components/employee-profile/CampaignHistoryCard";
import { ChangeCampaignDialog } from "@/components/ChangeCampaignDialog";
import { RecruitingAttachmentsCard } from "@/components/employee-profile/RecruitingAttachmentsCard";

// ── A1: Personal & Tax Info validation ──────────────────────────────
const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
const RFC_RE = /^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$/;
const CLABE_RE = /^\d{18}$/;
const PHONE_RE = /^\d{10}$/;
const NSS_RE = /^\d{10,11}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateTaxFields(fields: { curp: string; rfc: string; phone: string; bank_clabe: string; nss: string; personal_email: string; email?: string }) {
  const errors: Record<string, string> = {};
  if (fields.curp && !CURP_RE.test(fields.curp)) errors.curp = "CURP must be 18 characters (e.g. GARC850101HDFRRL09)";
  if (fields.rfc && !RFC_RE.test(fields.rfc)) errors.rfc = "RFC must be 13 characters (e.g. GARC850101AB3)";
  if (fields.bank_clabe && !CLABE_RE.test(fields.bank_clabe)) errors.bank_clabe = "CLABE must be exactly 18 digits";
  if (fields.phone) {
    const digits = fields.phone.replace(/[\s-]/g, "");
    if (!PHONE_RE.test(digits)) errors.phone = "Phone must be 10 digits";
  }
  if (fields.nss && !NSS_RE.test(fields.nss)) errors.nss = "NSS must be 10-11 digits";
  if (fields.personal_email && !EMAIL_RE.test(fields.personal_email)) errors.personal_email = "Invalid email format";
  if (fields.email && !EMAIL_RE.test(fields.email)) errors.email = "Invalid email format";
  return errors;
}

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "MXN" });

export default function EmpleadoPerfil() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: employees = [], isLoading } = useEmployees();
  const updateEmployee = useUpdateEmployee();
  const { data: activePeriod } = useActivePeriod();
  const createPeriod = useCreatePeriod();
  const { data: records = [] } = usePayrollRecords(activePeriod?.id);
  const queryClient = useQueryClient();
  const { isLeadership, isTeamLead, isOwner, isAdmin, isManager, employeeId: authEmployeeId } = useAuth();
  const [editNameOpen, setEditNameOpen] = useState(false);

  // Highlight inputs with an amber border when empty — leadership only, so
  // HR/admins can spot missing data at a glance. Skipped for fields where
  // empty is the normal state (e.g. Last Worked Day for active employees).
  const emptyHL = (value: unknown): string => {
    if (!isLeadership) return "";
    const empty = value === null || value === undefined || value === "";
    return empty ? "border-2 border-amber-400 focus-visible:border-amber-400" : "";
  };

  // A3a: compliance status for this employee (uses DB uuid)
  const empFromList = employees.find((e) => e.id === id);

  // TL fallback: useEmployees() queries the base table (leadership-only after RLS harden).
  // When a TL views an agent's profile, fetch basic info from the safe view instead.
  const needsTlFallback = !empFromList && !isLoading && isTeamLead && !isLeadership && !!id;
  const { data: tlFallback, isLoading: tlFallbackLoading } = useQuery({
    queryKey: ["tl-profile-fallback", id],
    queryFn: async () => {
      // Query employees directly (RLS tl_select_team_employees gates by team).
      // We pull the 5 contact fields so the TL "Personal Info" card has values
      // to display and edit.
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_id, full_name, work_name, personal_email, phone, address, emergency_contact, campaign_id, is_active, title, reports_to, email, campaigns!employees_campaign_id_fkey(name)")
        .eq("employee_id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.employee_id,
        nombre: data.full_name,
        sueldoBase: 0,
        descuentoPorDia: 0,
        kpiMonto: 0,
        title: (data.title || "agent") as import("@/types/payroll").EmpTitle,
        reportsTo: data.reports_to || null,
        _uuid: data.id,
        _campaignId: data.campaign_id || undefined,
        _campaignName: (data as Record<string, unknown> & { campaigns?: { name?: string } }).campaigns?.name || undefined,
        _workName: data.work_name ?? null,
        _personalEmail: data.personal_email ?? null,
        _phone: data.phone ?? null,
        _address: data.address ?? null,
        _emergencyContact: data.emergency_contact ?? null,
      } satisfies EmployeeWithMeta;
    },
    enabled: needsTlFallback,
  });

  // H1 fallback: useEmployees() filters to is_active=true, so terminated /
  // resigned / on-leave folks aren't in that cache. When leadership clicks an
  // inactive employee from the Inactive tab, fetch the full row directly.
  const needsInactiveFallback = !empFromList && !isLoading && isLeadership && !!id;
  const { data: inactiveFallback, isLoading: inactiveFallbackLoading } = useQuery({
    queryKey: ["inactive-profile-fallback", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, campaigns!employees_campaign_id_fkey(name), departments(name)")
        .eq("employee_id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.employee_id,
        nombre: data.full_name,
        sueldoBase: Number(data.monthly_base_salary) || 0,
        descuentoPorDia: Number(data.daily_discount_rate) || 0,
        kpiMonto: Number(data.kpi_bonus_amount) || 0,
        title: (data.title || "agent") as import("@/types/payroll").EmpTitle,
        reportsTo: data.reports_to || null,
        _uuid: data.id,
        _campaignId: data.campaign_id || undefined,
        _campaignName: (data as any).campaigns?.name || undefined,
        _curp: data.curp ?? null,
        _rfc: data.rfc ?? null,
        _address: data.address ?? null,
        _phone: data.phone ?? null,
        _bankClabe: data.bank_clabe ?? null,
        _complianceGraceUntil: data.compliance_grace_until ?? null,
        _workName: data.work_name ?? null,
        _personalEmail: data.personal_email ?? null,
        _email: data.email ?? null,
        _hireDate: data.hire_date ?? null,
        _emergencyContact: data.emergency_contact ?? null,
        _bankName: data.bank_name ?? null,
        _dateOfBirth: data.date_of_birth ?? null,
        _maritalStatus: data.marital_status ?? null,
        _nss: data.nss ?? null,
        _lastWorkedDay: data.last_worked_day ?? null,
        _departmentId: data.department_id ?? null,
        _departmentName: (data as any).departments?.name ?? null,
      } satisfies EmployeeWithMeta;
    },
    enabled: needsInactiveFallback,
  });

  const empRecord = empFromList ?? tlFallback ?? inactiveFallback ?? undefined;
  const empUuid = empRecord?._uuid ?? null;
  const compliance = useComplianceStatus(isLeadership ? empUuid : undefined);

  // Cascading Client → Campaign state
  const campaignId = empRecord?._campaignId ?? null;

  // Supervisor (from employees.reports_to)
  const supervisorId = empRecord?.reportsTo ?? null;
  const { data: supervisor } = useQuery({
    queryKey: ['supervisor', supervisorId],
    queryFn: async () => {
      if (!supervisorId) return null;
      const { data } = await supabase.from('employees_no_pay').select('full_name').eq('id', supervisorId).maybeSingle();
      return data;
    },
    enabled: !!supervisorId,
  });
  const supervisorName = supervisor?.full_name ?? null;

  // Eligible supervisors for the dropdown: any active employee with a
  // management title (manager / admin / owner). Used to assign reports_to.
  // For TLs: pick a manager+. For agents: this list also works (their TL
  // assignment is handled elsewhere via campaign).
  const { data: eligibleSupervisors = [] } = useQuery({
    queryKey: ['eligible-supervisors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, work_name, title')
        .in('title', ['manager', 'admin', 'owner'])
        .eq('is_active', true)
        .eq('is_system_user', false)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        full_name: string;
        work_name: string | null;
        title: string;
      }>;
    },
    enabled: isLeadership,
  });

  // Update reports_to for the currently-viewed employee.
  // Uses supabase directly (not via the legacy useUpdateEmployee hook).
  const updateReportsTo = useMutation({
    mutationFn: async (newSupervisorId: string | null) => {
      if (!emp?._uuid) throw new Error('Missing employee UUID');
      const { error } = await supabase
        .from('employees')
        .update({ reports_to: newSupervisorId })
        .eq('id', emp._uuid);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['supervisor'] });
      queryClient.invalidateQueries({ queryKey: ['my-manager-info'] });
      toast.success('Supervisor updated');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update supervisor');
    },
  });
  // Find which client this campaign belongs to
  const { data: currentCampaign } = useQuery({
    queryKey: ['emp-campaign', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const { data } = await supabase
        .from('campaigns')
        .select('id, client_id, name')
        .eq('id', campaignId)
        .maybeSingle();
      return data;
    },
    enabled: !!campaignId,
  });
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  useEffect(() => {
    if (currentCampaign?.client_id) setSelectedClientId(currentCampaign.client_id);
  }, [currentCampaign?.client_id]);
  const { data: campaignShifts = [] } = useQuery({
    queryKey: ['shift-options', campaignId],
    queryFn: async () => {
      if (!campaignId) return [];
      const { data, error } = await supabase
        .from('shift_settings')
        .select('id, shift_name, start_time, end_time, days_of_week, grace_minutes')
        .eq('campaign_id', campaignId)
        .order('shift_name');
      if (error) throw error;
      return data as { id: string; shift_name: string; start_time: string; end_time: string; days_of_week: number[] | null; grace_minutes: number | null }[];
    },
    enabled: !!campaignId,
  });

  // Auto-create period if none exists
  useEffect(() => {
    if (!isLoading && !activePeriod && !createPeriod.isPending) {
      createPeriod.mutate(getCurrentPeriodDates());
    }
  }, [isLoading, activePeriod]);

  const emp = empRecord;

  // ── A1: Personal & Tax Info state (must be above early returns) ──
  const [taxForm, setTaxForm] = useState({
    curp: "",
    rfc: "",
    address: "",
    phone: "",
    bank_clabe: "",
    // A1b: expanded fields
    work_name: "",
    personal_email: "",
    hire_date: "",
    emergency_contact: "",
    bank_name: "",
    date_of_birth: "",
    marital_status: "",
    nss: "",
    last_worked_day: "",
    department_id: "",
    // Work email — only writable when currently NULL (initial assignment).
    // Once set, treat as read-only because changing it requires syncing auth.users.email.
    email: "",
  });
  const [taxErrors, setTaxErrors] = useState<Record<string, string>>({});
  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [pendingCampaignChange, setPendingCampaignChange] = useState<{ id: string; name: string } | null>(null);
  const [emailEditOpen, setEmailEditOpen] = useState(false);
  const [emailEditDraft, setEmailEditDraft] = useState("");
  const [emailEditError, setEmailEditError] = useState("");
  const updateWorkEmailMutation = useMutation({
    mutationFn: async ({ employeeId, newEmail }: { employeeId: string; newEmail: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("update-work-email", {
        body: { employeeId, newEmail },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) {
        // supabase-js wraps non-2xx responses in res.error and leaves res.data null;
        // edgeErrorMessage digs the real reason out of res.error.context.
        throw new Error(await edgeErrorMessage(res.error));
      }
      const body = res.data as { ok?: boolean; error?: string };
      if (body?.error) throw new Error(body.error);
    },
    onSuccess: () => {
      toast.success("Work email updated — the employee will need to use the new address to log in.");
      setEmailEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err: Error) => {
      setEmailEditError(err.message === "email_taken" ? "That email is already in use." : err.message);
    },
  });
  // B-02: dirty flag prevents TanStack refetches from clobbering in-flight edits
  const taxFormDirty = useRef(false);
  const setTaxFormDirty: typeof setTaxForm = (update) => {
    taxFormDirty.current = true;
    setTaxForm(update);
  };

  // A1b: departments for dropdown
  const { data: departments = [] } = useDepartments();
  const activeDepartments = departments.filter((d) => d.is_active);

  // Sync when emp data loads/changes
  const empCurp = emp?._curp ?? "";
  const empRfc = emp?._rfc ?? "";
  const empAddress = emp?._address ?? "";
  const empPhone = emp?._phone ?? "";
  const empBankClabe = emp?._bankClabe ?? "";
  const empWorkName = emp?._workName ?? "";
  const empPersonalEmail = emp?._personalEmail ?? "";
  const empHireDate = emp?._hireDate ?? "";
  const empEmergencyContact = emp?._emergencyContact ?? "";
  const empBankName = emp?._bankName ?? "";
  const empDateOfBirth = emp?._dateOfBirth ?? "";
  const empMaritalStatus = emp?._maritalStatus ?? "";
  const empNss = emp?._nss ?? "";
  const empLastWorkedDay = emp?._lastWorkedDay ?? "";
  const empDepartmentId = emp?._departmentId ?? "";
  const empEmail = emp?._email ?? "";
  const emailIsLocked = !!empEmail; // already set — UI shows read-only

  // Local state for salary fields — only persisted on blur, not on every keystroke
  const [salaryDraft, setSalaryDraft] = useState({
    sueldoBase: "",
    descuentoPorDia: "",
    kpiMonto: "",
  });

  // Sync salary draft when emp data loads
  useEffect(() => {
    setSalaryDraft({
      sueldoBase: emp?.sueldoBase != null ? String(emp.sueldoBase) : "",
      descuentoPorDia: emp?.descuentoPorDia != null ? String(emp.descuentoPorDia) : "",
      kpiMonto: emp?.kpiMonto != null ? String(emp.kpiMonto) : "",
    });
  }, [emp?.sueldoBase, emp?.descuentoPorDia, emp?.kpiMonto]);

  useEffect(() => {
    // B-02: skip sync when user has unsaved edits — prevents refetch clobber
    if (taxFormDirty.current) return;
    setTaxForm({
      curp: empCurp || "",
      rfc: empRfc || "",
      address: empAddress || "",
      phone: empPhone || "",
      bank_clabe: empBankClabe || "",
      work_name: empWorkName || "",
      personal_email: empPersonalEmail || "",
      hire_date: empHireDate || "",
      emergency_contact: empEmergencyContact || "",
      bank_name: empBankName || "",
      date_of_birth: empDateOfBirth || "",
      marital_status: empMaritalStatus || "",
      nss: empNss || "",
      last_worked_day: empLastWorkedDay || "",
      department_id: empDepartmentId || "",
      email: empEmail || "",
    });
  }, [empCurp, empRfc, empAddress, empPhone, empBankClabe, empWorkName, empPersonalEmail, empHireDate, empEmergencyContact, empBankName, empDateOfBirth, empMaritalStatus, empNss, empLastWorkedDay, empDepartmentId, empEmail]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LogoLoadingIndicator /></div>;
  }
  if (needsTlFallback && !tlFallback && tlFallbackLoading) {
    return <div className="flex items-center justify-center py-20"><LogoLoadingIndicator /></div>;
  }
  if (needsInactiveFallback && !inactiveFallback && inactiveFallbackLoading) {
    return <div className="flex items-center justify-center py-20"><LogoLoadingIndicator /></div>;
  }

  if (!emp) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">Employee not found</p>
        <Button variant="outline" onClick={() => navigate("/empleados")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  // Phase 4c: payroll summary card now reads directly from payroll_records.
  // calcularNomina() is retired — full breakdown lives at /admin/payroll/agent/:id.
  const empPayrollRecord = records.find((r: { employee_id: string }) => r.employee_id === emp?._uuid);
  const calculatedNetPay: number | null = empPayrollRecord?.calculated_net_pay ?? null;
  const dailySalary = emp?.sueldoBase ? emp.sueldoBase / 30 : 0;

  const saveField = (field: string, value: unknown) => {
    updateEmployee.mutate(
      { employeeId: emp.id, data: { [field]: value } },
      { onSuccess: () => toast.success("Dato guardado") }
    );
  };

  const saveTaxFields = () => {
    const normalized = { ...taxForm, phone: taxForm.phone.replace(/[\s-]/g, "") };
    const errors = validateTaxFields(normalized);
    setTaxErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Email handling: only send `email` in the payload when it's currently
    // unset AND the form has a non-empty value. Once an email is set, the
    // field is read-only in the UI; we drop it from the payload to be safe.
    const { email: formEmail, ...rest } = normalized;
    const includeEmail = !emailIsLocked && formEmail && formEmail.trim().length > 0;

    updateEmployee.mutate(
      {
        employeeId: emp.id,
        data: {
          ...rest,
          hire_date: rest.hire_date || null,
          date_of_birth: rest.date_of_birth || null,
          last_worked_day: rest.last_worked_day || null,
          department_id: rest.department_id || null,
          ...(includeEmail ? { email: formEmail.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          taxFormDirty.current = false; // B-02: allow next refetch to sync
          toast.success("Employee record saved");
          queryClient.invalidateQueries({ queryKey: ["employees"] });
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" onClick={() => navigate(isLeadership ? "/empleados" : "/asistencia")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> {isLeadership ? "Back to Employees" : "Back to Attendance"}
      </Button>

      {(() => {
        // Permission rule for renaming this employee:
        //   - owner / admin → always allowed
        //   - manager       → allowed only when target is agent or team_lead
        //   - everyone else → hidden (TLs ask a manager directly)
        const targetTitle = emp.title || "agent";
        const managerCanEdit =
          isManager && (targetTitle === "agent" || targetTitle === "team_lead");
        const canEditName = isOwner || isAdmin || managerCanEdit;

        return (
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">{emp.nombre[0]}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">
                  {getDisplayName({ work_name: emp._workName, full_name: emp.nombre })}
                </h2>
                {canEditName && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setEditNameOpen(true)}
                    title="Edit name"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground">ID: {emp.id}</p>
            </div>

            {canEditName && empUuid && (
              <EditNameDialog
                open={editNameOpen}
                onOpenChange={setEditNameOpen}
                employeeUuid={empUuid}
                currentFullName={emp.nombre}
                currentWorkName={emp._workName}
              />
            )}
          </div>
        );
      })()}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Assignment Card — visible to Team Lead and above */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Assignment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {isLeadership ? (
              <ClientCampaignPicker
                value={{ clientId: selectedClientId || null, campaignId: campaignId || null }}
                onChange={async ({ clientId, campaignId: newCampaignId }) => {
                  setSelectedClientId(clientId || "");
                  if (newCampaignId && newCampaignId !== campaignId) {
                    // Open the change dialog (writes history rows + employees.campaign_id).
                    // Fetch the new campaign's name for the dialog header.
                    const { data: cmp } = await supabase
                      .from("campaigns")
                      .select("id, name")
                      .eq("id", newCampaignId)
                      .single();
                    if (cmp) {
                      setPendingCampaignChange({ id: cmp.id, name: cmp.name });
                    }
                  } else if (newCampaignId === null && campaignId) {
                    // Removing campaign entirely — keep old direct-update behavior for now.
                    // TODO: history-aware "remove from campaign" with effective date.
                    const { error } = await supabase
                      .from("employees")
                      .update({ campaign_id: null })
                      .eq("employee_id", emp.id);
                    if (error) {
                      toast.error(`Failed to remove campaign: ${error.message}`);
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: ["employees"] });
                    toast.success("Campaign removed");
                  }
                }}
              />
            ) : (
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground text-xs">Campaign</Label>
                <p className="text-sm">{empRecord?._campaignName || "—"}</p>
              </div>
            )}
            {/* Role — TLs see read-only, leadership can change */}
            <div className="grid gap-1.5">
              <Label className={isLeadership ? "" : "text-muted-foreground text-xs"}>Role</Label>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <span className="text-sm capitalize">
                  {String(emp.title || "agent").replace("_", " ")}
                </span>
                {isLeadership && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setChangeRoleOpen(true)}
                  >
                    Change role
                  </Button>
                )}
              </div>
              {isLeadership && (
                <p className="text-xs text-muted-foreground">
                  Promotes/demotes the employee. App access updates after their next sign-in.
                </p>
              )}
            </div>
            {/* Shift (read-only from campaign settings) */}
            {campaignShifts.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Shift</Label>
                <div className="p-2.5 rounded-md border bg-muted/30 text-sm">
                  {campaignShifts[0].start_time?.slice(0, 5)}–{campaignShifts[0].end_time?.slice(0, 5)}
                  <span className="text-muted-foreground ml-2">
                    ({campaignShifts[0].days_of_week?.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')})
                  </span>
                </div>
              </div>
            )}
            {/* Supervisor — leadership can change via dropdown; everyone else
                sees read-only display. Phase 4b: D set all TLs to report to him;
                this dropdown lets the assignment change (to Joe, etc.) later. */}
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">Supervisor (reports to)</Label>
              {isLeadership ? (
                <Select
                  value={supervisorId ?? "__none__"}
                  onValueChange={(v) => {
                    updateReportsTo.mutate(v === "__none__" ? null : v);
                  }}
                  disabled={updateReportsTo.isPending}
                >
                  <SelectTrigger className="h-9 max-w-sm">
                    <SelectValue placeholder="Select a supervisor…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground italic">No supervisor</span>
                    </SelectItem>
                    {eligibleSupervisors.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id}>
                        {sup.work_name || sup.full_name}
                        <span className="text-xs text-muted-foreground ml-2">
                          · {sup.title}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm">{supervisorName || "—"}</p>
              )}
            </div>

            {/* Salary Configuration — leadership only, embedded inside Assignment */}
            {isLeadership && (
              <>
                <Separator />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salary Configuration</p>
                <div className="grid gap-2">
                  <Label>Monthly Base Salary</Label>
                  <Input
                    type="number"
                    value={salaryDraft.sueldoBase}
                    onChange={(e) => setSalaryDraft((d) => ({ ...d, sueldoBase: e.target.value }))}
                    onBlur={() => saveField("sueldoBase", parseFloat(salaryDraft.sueldoBase) || 0)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Daily Absence Discount</Label>
                  <Input
                    type="number"
                    value={salaryDraft.descuentoPorDia}
                    onChange={(e) => setSalaryDraft((d) => ({ ...d, descuentoPorDia: e.target.value }))}
                    onBlur={() => saveField("descuentoPorDia", parseFloat(salaryDraft.descuentoPorDia) || 0)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>KPI Bonus Amount</Label>
                  <Input
                    type="number"
                    value={salaryDraft.kpiMonto}
                    onChange={(e) => setSalaryDraft((d) => ({ ...d, kpiMonto: e.target.value }))}
                    onBlur={() => saveField("kpiMonto", parseFloat(salaryDraft.kpiMonto) || 0)}
                  />
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">Daily Rate (Base ÷ 30)</p>
                  <p className="text-xl font-bold">{dailySalary > 0 ? fmt(dailySalary) : "—"}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* TL Personal Info card — limited edit for Team Leads on their team.
            Leadership has the full Employee Record card below, so skip for them. */}
        {isTeamLead && !isLeadership && emp._uuid && (
          <PersonalInfoCard
            employeeUuid={emp._uuid}
            initialWorkName={empWorkName}
            initialPersonalEmail={empPersonalEmail}
            initialPhone={empPhone}
            initialAddress={empAddress}
            initialEmergencyContact={empEmergencyContact}
          />
        )}

        {/* A1 + A1b: Employee Record — leadership only */}
        {isLeadership && <Card>
          <CardHeader><CardTitle className="text-lg">Employee Record</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {/* ── Personal ── */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Work Name</Label>
                <Input
                  className={emptyHL(taxForm.work_name)}
                  value={taxForm.work_name}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, work_name: e.target.value }))}
                  placeholder="Preferred name"
                />
              </div>
              <div className="grid gap-2">
                <Label>Personal Email</Label>
                <Input
                  className={emptyHL(taxForm.personal_email)}
                  type="email"
                  value={taxForm.personal_email}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, personal_email: e.target.value }))}
                  placeholder="personal@example.com"
                />
                {taxErrors.personal_email && <p className="text-xs text-destructive">{taxErrors.personal_email}</p>}
              </div>
              <div className="grid gap-2">
                <Label>Date of Birth</Label>
                <Input
                  className={emptyHL(taxForm.date_of_birth)}
                  type="date"
                  value={taxForm.date_of_birth}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, date_of_birth: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Marital Status</Label>
                <Input
                  className={emptyHL(taxForm.marital_status)}
                  value={taxForm.marital_status}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, marital_status: e.target.value }))}
                  placeholder="e.g. Soltero, Casado"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Emergency Contact</Label>
                <Input
                  className={emptyHL(taxForm.emergency_contact)}
                  value={taxForm.emergency_contact}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, emergency_contact: e.target.value }))}
                  placeholder="Name — Relationship — Phone"
                />
              </div>
              <div className="grid gap-2">
                <Label>Phone</Label>
                <Input
                  className={emptyHL(taxForm.phone)}
                  value={taxForm.phone}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="33 1234 5678"
                  maxLength={15}
                />
                {taxErrors.phone && <p className="text-xs text-destructive">{taxErrors.phone}</p>}
              </div>
              <div className="grid gap-2">
                <Label>Address</Label>
                <Input
                  className={emptyHL(taxForm.address)}
                  value={taxForm.address}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Calle, Colonia, Ciudad, CP"
                />
              </div>
            </div>

            <Separator />

            {/* ── Employment ─�� */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employment</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Work Email — editable only when currently unset (initial assignment).
                  Once set, login email changes are non-trivial (need to sync
                  auth.users.email), so we display it read-only. */}
              <div className="grid gap-2 sm:col-span-2">
                <Label>Work Email <span className="text-muted-foreground font-normal">(login)</span></Label>
                {emailIsLocked ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2.5 rounded-md border bg-muted/30 text-sm">{empEmail}</div>
                      {isLeadership && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { setEmailEditDraft(empEmail); setEmailEditError(""); setEmailEditOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      )}
                    </div>
                    {!isLeadership && (
                      <p className="text-xs text-muted-foreground">Login email — contact a manager to change it.</p>
                    )}
                  </>
                ) : (
                  <>
                    <Input
                      className={emptyHL(taxForm.email)}
                      type="email"
                      value={taxForm.email}
                      onChange={(e) => setTaxFormDirty((f) => ({ ...f, email: e.target.value }))}
                      placeholder="name@yourdomain.com"
                    />
                    {taxErrors.email && <p className="text-xs text-destructive">{taxErrors.email}</p>}
                    <p className="text-xs text-muted-foreground">
                      No login yet. After you save here, click the envelope icon on the Employees list to send the invite.
                    </p>
                  </>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Hire Date</Label>
                <Input
                  className={emptyHL(taxForm.hire_date)}
                  type="date"
                  value={taxForm.hire_date}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, hire_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Department</Label>
                <Select
                  value={taxForm.department_id || "none"}
                  onValueChange={(v) => setTaxFormDirty((f) => ({ ...f, department_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className={emptyHL(taxForm.department_id)}>
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {activeDepartments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Last Worked Day</Label>
                <Input
                  type="date"
                  value={taxForm.last_worked_day}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, last_worked_day: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

            {/* ── Banking ── */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Banking</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Bank Name</Label>
                <Input
                  className={emptyHL(taxForm.bank_name)}
                  value={taxForm.bank_name}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, bank_name: e.target.value }))}
                  placeholder="e.g. BBVA, Banorte"
                />
              </div>
              <div className="grid gap-2">
                <Label>Bank CLABE</Label>
                <Input
                  className={emptyHL(taxForm.bank_clabe)}
                  value={taxForm.bank_clabe}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, bank_clabe: e.target.value.replace(/\D/g, "") }))}
                  placeholder="012345678901234567"
                  maxLength={18}
                />
                {taxErrors.bank_clabe && <p className="text-xs text-destructive">{taxErrors.bank_clabe}</p>}
              </div>
            </div>

            <Separator />

            {/* ── ID / Tax ── */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID / Tax</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>CURP</Label>
                <Input
                  className={emptyHL(taxForm.curp)}
                  value={taxForm.curp}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, curp: e.target.value.toUpperCase() }))}
                  placeholder="GARC850101HDFRRL09"
                  maxLength={18}
                />
                {taxErrors.curp && <p className="text-xs text-destructive">{taxErrors.curp}</p>}
              </div>
              <div className="grid gap-2">
                <Label>RFC</Label>
                <Input
                  className={emptyHL(taxForm.rfc)}
                  value={taxForm.rfc}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
                  placeholder="GARC850101AB3"
                  maxLength={13}
                />
                {taxErrors.rfc && <p className="text-xs text-destructive">{taxErrors.rfc}</p>}
              </div>
              <div className="grid gap-2">
                <Label>NSS (IMSS)</Label>
                <Input
                  className={emptyHL(taxForm.nss)}
                  value={taxForm.nss}
                  onChange={(e) => setTaxFormDirty((f) => ({ ...f, nss: e.target.value.replace(/\D/g, "") }))}
                  placeholder="12345678901"
                  maxLength={11}
                />
                {taxErrors.nss && <p className="text-xs text-destructive">{taxErrors.nss}</p>}
              </div>
            </div>

            <Button onClick={saveTaxFields} disabled={updateEmployee.isPending} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {updateEmployee.isPending ? "Saving..." : "Save Employee Record"}
            </Button>
          </CardContent>
        </Card>}

      </div>

      {/* Campaign History — visible to TL+ ; hidden when only one assignment exists */}
      {(isLeadership || isTeamLead) && emp._uuid && (
        <CampaignHistoryCard employeeUuid={emp._uuid} />
      )}

      {/* Clock-in History — visible to TL+ ; reuses campaignShifts (single shift per campaign) */}
      {(isLeadership || isTeamLead) && emp._uuid && (
        <ClockInHistoryCard
          employeeUuid={emp._uuid}
          employeeName={emp._workName || emp.nombre}
          hireDate={emp._hireDate ?? null}
          lastWorkedDay={emp._lastWorkedDay ?? null}
          clientId={currentCampaign?.client_id ?? null}
          campaignId={currentCampaign?.id ?? null}
          canManageDayOff={isLeadership}
          shift={campaignShifts[0] ? {
            start_time: campaignShifts[0].start_time,
            end_time: campaignShifts[0].end_time,
            grace_minutes: campaignShifts[0].grace_minutes,
            days_of_week: campaignShifts[0].days_of_week,
          } : null}
        />
      )}

      {/* A3a: Compliance Enforcement — leadership only */}
      {isLeadership && (
        <ComplianceCard
          employeeId={emp.id}
          compliance={compliance}
          graceRaw={emp._complianceGraceUntil ?? null}
          updateEmployee={updateEmployee}
        />
      )}

      {/* A2b: Required Documents — leadership + TL (read-only for TL) */}
      {(isLeadership || isTeamLead) && <RequiredDocumentsCard employeeId={emp._uuid} readOnly={!isLeadership} />}

      {/* B1: Notes & Verbal Warnings — leadership + TL on own campaign */}
      {(isLeadership || (isTeamLead && campaignId)) && (
        <AgentLogCard
          agentId={emp._uuid!}
          campaignId={campaignId}
          authorEmployeeId={authEmployeeId}
          isLeadership={isLeadership}
        />
      )}

      {/* B4: Attendance Incidents — leadership + TL on own campaign */}
      {(isLeadership || (isTeamLead && campaignId)) && (
        <AttendanceIncidentsCard agentId={emp._uuid!} employeeId={emp._uuid!} creatorEmployeeId={authEmployeeId!} />
      )}

      {/* B2/B3: Cartas & Actas — leadership + TL on own campaign */}
      {(isLeadership || (isTeamLead && campaignId)) && (
        <HrDocumentRequestsCard employeeId={emp._uuid!} authEmployeeId={authEmployeeId!} />
      )}

      {/* Uptraining — generate + upload signed constancia; leadership + TL on own campaign */}
      {(isLeadership || (isTeamLead && campaignId)) && (
        <UptrainingCard employeeId={emp._uuid!} authEmployeeId={authEmployeeId!} mode="manage" />
      )}

      {/* C1: Policy Acknowledgments — leadership only */}
      {isLeadership && <PolicyAckCard agentId={emp._uuid!} agentCampaignId={campaignId} agentRole={emp.title} />}

      {/* From Application — CV + intro recording captured at hire time.
          Self-hides if the employee has no recruiting attachments. */}
      {isLeadership && <RecruitingAttachmentsCard emp={emp} />}

      {/* H2: Employment History — leadership only */}
      {isLeadership && emp._uuid && <EmploymentHistoryCard employeeUuid={emp._uuid} />}

      {/* I1: 30-Day Review — TL of own team + leadership */}
      {(isLeadership || isTeamLead) && emp._uuid && <ThirtyDayReviewCard employeeId={emp._uuid} />}

      {/* Current Period Pay — leadership only (Phase 4c: replaces the old EMPTY_PAYROLL_RESULT card) */}
      {isLeadership && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg">Current Period Pay</CardTitle>
          <Button asChild variant="outline" size="sm">
            <a href={`/admin/payroll/agent/${id}`}>Full Breakdown →</a>
          </Button>
        </CardHeader>
        <CardContent>
          {calculatedNetPay !== null ? (
            <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
              <span className="font-semibold text-muted-foreground">Net Pay (last run)</span>
              <span className="font-bold text-2xl text-primary">{fmt(calculatedNetPay)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No payroll record for the current period yet.{" "}
              <a href={`/admin/payroll/agent/${id}`} className="underline">Run payroll →</a>
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {emp._uuid && (
        <ChangeRoleDialog
          open={changeRoleOpen}
          onOpenChange={setChangeRoleOpen}
          employeeId={emp._uuid}
          employeeName={emp.nombre}
          currentTitle={(emp.title || "agent") as "agent" | "team_lead" | "manager" | "admin" | "owner"}
        />
      )}

      {emp._uuid && pendingCampaignChange && (
        <ChangeCampaignDialog
          open={!!pendingCampaignChange}
          onOpenChange={(open) => { if (!open) setPendingCampaignChange(null); }}
          employeeUuid={emp._uuid}
          employeeTextId={emp.id}
          employeeName={emp._workName || emp.nombre}
          currentCampaignId={campaignId || null}
          currentCampaignName={currentCampaign?.name || null}
          newCampaignId={pendingCampaignChange.id}
          newCampaignName={pendingCampaignChange.name}
        />
      )}

      {/* Work email edit dialog — manager/owner only */}
      <Dialog open={emailEditOpen} onOpenChange={(o) => { if (!updateWorkEmailMutation.isPending) setEmailEditOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Work Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This updates both the employee record <strong>and</strong> their login address.
              They'll need to use the new email the next time they sign in.
            </p>
            <Input
              type="email"
              value={emailEditDraft}
              onChange={(e) => { setEmailEditDraft(e.target.value); setEmailEditError(""); }}
              placeholder="new@yourdomain.com"
              disabled={updateWorkEmailMutation.isPending}
            />
            {emailEditError && <p className="text-xs text-destructive">{emailEditError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailEditOpen(false)} disabled={updateWorkEmailMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={updateWorkEmailMutation.isPending || !emailEditDraft.trim()}
              onClick={() => {
                // emp.id is the human-readable code (e.g. "EMP-035").
                // The edge function expects the UUID PK, which lives at empUuid.
                if (!empUuid) return;
                updateWorkEmailMutation.mutate({ employeeId: empUuid, newEmail: emailEditDraft.trim() });
              }}
            >
              {updateWorkEmailMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={negative ? "text-destructive" : ""}>{value}</span>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

// ── A3a: Compliance Enforcement Card (leadership only) ───────────────

function ComplianceCard({
  employeeId,
  compliance,
  graceRaw,
  updateEmployee,
}: {
  employeeId: string;
  compliance: ReturnType<typeof useComplianceStatus>;
  graceRaw: string | null;
  updateEmployee: ReturnType<typeof useUpdateEmployee>;
}) {
  const [dateValue, setDateValue] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // Sync local state when prop changes
  useEffect(() => {
    setDateValue(graceRaw ?? "");
  }, [graceRaw]);

  const saveGrace = (value: string | null) => {
    updateEmployee.mutate(
      { employeeId, data: { compliance_grace_until: value } },
      {
        onSuccess: () => {
          toast.success(value ? `Grace deadline set to ${value}` : "Enforcement cleared");
          setShowPicker(false);
        },
      }
    );
  };

  // Status display
  let statusIcon: React.ReactNode;
  let statusLabel: string;
  let statusColor: string;
  if (compliance.isCompliant) {
    statusIcon = <ShieldCheck className="h-5 w-5 text-emerald-600" />;
    statusLabel = "Compliant";
    statusColor = "text-emerald-700";
  } else if (compliance.isLocked) {
    const lockedSince = graceRaw
      ? formatDateMX(graceRaw)
      : "—";
    statusIcon = <ShieldX className="h-5 w-5 text-red-600" />;
    statusLabel = `Locked since ${lockedSince}`;
    statusColor = "text-red-700";
  } else if (compliance.isInGrace) {
    const graceDate = formatDateMX(compliance.graceUntil);
    statusIcon = <ShieldAlert className="h-5 w-5 text-amber-600" />;
    statusLabel = `In grace until ${graceDate}`;
    statusColor = "text-amber-700";
  } else {
    statusIcon = <ShieldCheck className="h-5 w-5 text-muted-foreground" />;
    statusLabel = "No enforcement set";
    statusColor = "text-muted-foreground";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Compliance Enforcement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status display */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          {statusIcon}
          <div>
            <p className={`font-medium text-sm ${statusColor}`}>{statusLabel}</p>
            {compliance.missingTypes.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {compliance.missingTypes.length} missing required doc{compliance.missingTypes.length > 1 ? "s" : ""}:{" "}
                {compliance.missingTypes.map((t) => t.name).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Grace date controls */}
        {showPicker ? (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>Grace deadline</Label>
              <Input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!dateValue) {
                    toast.error("Pick a date first");
                    return;
                  }
                  saveGrace(dateValue);
                }}
                disabled={updateEmployee.isPending}
              >
                <Save className="mr-1 h-3 w-3" />
                {updateEmployee.isPending ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPicker(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDateValue(graceRaw ?? "");
                setShowPicker(true);
              }}
            >
              <CalendarClock className="mr-1 h-3 w-3" />
              {graceRaw ? "Extend grace" : "Set grace deadline"}
            </Button>
            {graceRaw && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => saveGrace(null)}
                disabled={updateEmployee.isPending}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Clear enforcement
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── A2b: Required Documents Card (leadership only) ──────────────────

function RequiredDocumentsCard({ employeeId, readOnly = false }: { employeeId: string; readOnly?: boolean }) {
  const { data: rows = [], isLoading } = useEmployeeDocuments(employeeId);
  const uploadDoc = useUploadDocument();
  const reviewDoc = useReviewDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; employeeId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so same file can be re-selected
    if (!file || !uploadTarget) return;

    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      toast.error("Unsupported file type. Please upload PDF, JPG, or PNG.");
      return;
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      toast.error("File too large. Maximum size is 10 MB.");
      return;
    }

    uploadDoc.mutate(
      { employeeId, documentTypeId: uploadTarget, file },
      {
        onSuccess: () => {
          toast.success("Document uploaded");
          setUploadTarget(null);
        },
        onError: (err) => toast.error(`Upload failed: ${(err as Error).message}`),
      }
    );
  };

  const triggerUpload = (typeId: string) => {
    setUploadTarget(typeId);
    fileInputRef.current?.click();
  };

  const handleApprove = (docId: string) => {
    reviewDoc.mutate(
      { documentId: docId, employeeId, status: "approved" },
      {
        onSuccess: () => toast.success("Document approved"),
        onError: (err) => toast.error(`Approval failed: ${(err as Error).message}`),
      }
    );
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }
    reviewDoc.mutate(
      { documentId: rejectTarget.id, employeeId: rejectTarget.employeeId, status: "rejected", rejectionReason: rejectReason.trim() },
      {
        onSuccess: () => {
          toast.success("Document rejected");
          setRejectTarget(null);
          setRejectReason("");
        },
        onError: (err) => toast.error(`Rejection failed: ${(err as Error).message}`),
      }
    );
  };

  const handleView = async (filePath: string) => {
    try {
      const url = await getDocumentSignedUrl(filePath);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to generate view link");
    }
  };

  if (isLoading) return null;
  if (rows.length === 0) return null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        className="hidden"
        aria-label="Upload employee document"
        onChange={handleFileSelect}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Required Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.map(({ type, document: doc }) => (
            <div key={type.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{type.name}</p>
                  {type.description && (
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  )}
                </div>
                <DocumentStatusBadge document={doc} />
              </div>

              {/* File info when doc exists — hidden in read-only (TL) mode */}
              {!readOnly && doc && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="truncate max-w-[200px]">{doc.file_name}</span>
                  <span>·</span>
                  <span>{formatDateMX(doc.uploaded_at)}</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleView(doc.file_path)}>
                    <Eye className="mr-1 h-3 w-3" /> View
                  </Button>
                </div>
              )}

              {/* Rejection reason — hidden in read-only (TL) mode */}
              {!readOnly && doc?.status === "rejected" && doc.rejection_reason && (
                <p className="text-xs text-destructive">Reason: {doc.rejection_reason}</p>
              )}

              {/* Actions — hidden in read-only mode */}
              {!readOnly && (
              <div className="flex gap-2 mt-1">
                {!doc && (
                  <Button size="sm" variant="outline" onClick={() => triggerUpload(type.id)} disabled={uploadDoc.isPending}>
                    <Upload className="mr-1 h-3 w-3" /> Upload
                  </Button>
                )}
                {doc?.status === "pending_review" && (
                  <>
                    <Button size="sm" variant="outline" className="text-emerald-700" onClick={() => handleApprove(doc.id)} disabled={reviewDoc.isPending}>
                      <Check className="mr-1 h-3 w-3" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRejectTarget({ id: doc.id, employeeId })} disabled={reviewDoc.isPending}>
                      <X className="mr-1 h-3 w-3" /> Reject
                    </Button>
                  </>
                )}
                {doc?.status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => triggerUpload(type.id)} disabled={uploadDoc.isPending}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Replace
                  </Button>
                )}
                {doc?.status === "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => triggerUpload(type.id)} disabled={uploadDoc.isPending}>
                    <Upload className="mr-1 h-3 w-3" /> Re-upload
                  </Button>
                )}
              </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rejection reason dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea
              id="reject-reason"
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this document was rejected..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={reviewDoc.isPending}>
              {reviewDoc.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── B1: Notes & Verbal Warnings Card ──────────────────────────────────

function AgentLogCard({
  agentId,
  campaignId,
  authorEmployeeId,
  isLeadership,
}: {
  agentId: string;
  campaignId: string | null;
  authorEmployeeId: string | null;
  isLeadership: boolean;
}) {
  const { data: entries = [], isLoading } = useAgentLogEntries(agentId);
  const createEntry = useCreateAgentLogEntry();
  const toggleVisibility = useToggleEntryVisibility();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [entryType, setEntryType] = useState<"note" | "verbal_warning">("note");
  const [noteText, setNoteText] = useState("");
  const [shareWithAgent, setShareWithAgent] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const ENTRIES_LIMIT = 5;

  const warningCount = entries.filter((e) => e.entry_type === "verbal_warning").length;
  const canCreate = !!campaignId && !!authorEmployeeId;

  const handleCreate = () => {
    if (!campaignId || !authorEmployeeId || !noteText.trim()) return;
    createEntry.mutate(
      {
        agentId,
        entryType,
        note: noteText.trim(),
        campaignId,
        authorId: authorEmployeeId,
        visibleToAgent: shareWithAgent,
      },
      {
        onSuccess: () => {
          toast.success(entryType === "verbal_warning" ? "Verbal warning recorded" : "Note added");
          setDialogOpen(false);
          setNoteText("");
          setEntryType("note");
          setShareWithAgent(false);
        },
        onError: (err) => toast.error((err as Error).message),
      }
    );
  };

  const handleToggleVisibility = (entry: AgentLogEntry) => {
    toggleVisibility.mutate(
      { id: entry.id, agentId, visibleToAgent: !entry.visible_to_agent },
      {
        onSuccess: () => toast.success(entry.visible_to_agent ? "Hidden from agent" : "Shared with agent"),
        onError: (err) => toast.error((err as Error).message),
      }
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <StickyNote className="h-5 w-5" />
              Notes & Verbal Warnings
              {entries.length > 0 && (
                <Badge variant="secondary" className="text-xs">{entries.length}</Badge>
              )}
            </CardTitle>
            {canCreate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEntryType("note");
                  setNoteText("");
                  setShareWithAgent(false);
                  setDialogOpen(true);
                }}
              >
                <Plus className="mr-1 h-3 w-3" /> Add entry
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {warningCount > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                {warningCount} verbal warning{warningCount !== 1 ? "s" : ""} on record
              </p>
            </div>
          )}

          {isLoading && <LogoLoadingIndicator size="sm" />}
          {!isLoading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No entries yet.</p>
          )}

          {entries.length > 0 && (() => {
            const visibleEntries = showAllEntries ? entries : entries.slice(0, ENTRIES_LIMIT);
            const hiddenEntryCount = entries.length - ENTRIES_LIMIT;
            return (
              <>
                <ul className="space-y-3">
                  {visibleEntries.map((entry) => (
                    <li key={entry.id} className="border-l-2 border-muted pl-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.entry_type === "verbal_warning" ? (
                          <Badge variant="destructive" className="text-xs"><FileWarning className="mr-1 h-3 w-3" />Verbal Warning</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs"><StickyNote className="mr-1 h-3 w-3" />Note</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDateMX(entry.created_at)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          — {entry.author?.full_name ?? "Unknown"}
                        </span>
                        {entry.visible_to_agent ? (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700"><Eye className="mr-1 h-3 w-3" />Visible to agent</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground"><EyeOff className="mr-1 h-3 w-3" />Internal</Badge>
                        )}
                      </div>
                      <p className="text-sm">{entry.note}</p>
                      {(isLeadership || entry.author_id === authorEmployeeId) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleToggleVisibility(entry)}
                          disabled={toggleVisibility.isPending}
                        >
                          {entry.visible_to_agent ? "Hide from agent" : "Share with agent"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {!showAllEntries && hiddenEntryCount > 0 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowAllEntries(true)}>
                    Ver {hiddenEntryCount} más
                  </Button>
                )}
                {showAllEntries && entries.length > ENTRIES_LIMIT && (
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowAllEntries(false)}>
                    Mostrar menos
                  </Button>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Add entry dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Log Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="entry-type"
                    checked={entryType === "note"}
                    onChange={() => setEntryType("note")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Note</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="entry-type"
                    checked={entryType === "verbal_warning"}
                    onChange={() => setEntryType("verbal_warning")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Verbal Warning</span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-note">Details</Label>
              <Textarea
                id="entry-note"
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Describe the note or warning..."
                rows={4}
              />
            </div>
            {authorEmployeeId && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareWithAgent}
                  onChange={(e) => setShareWithAgent(e.target.checked)}
                  className="accent-primary"
                />
                <span className="text-sm">Share with agent</span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createEntry.isPending || !noteText.trim()}>
              {createEntry.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── B4: Attendance Incidents Card ─────────────────────────────────────

const INCIDENT_COLORS: Record<IncidentType, string> = {
  no_call_no_show: "bg-red-100 text-red-800 border-red-200",
  late: "bg-amber-100 text-amber-800 border-amber-200",
  sick: "bg-amber-100 text-amber-800 border-amber-200",
  medical_leave: "bg-amber-100 text-amber-800 border-amber-200",
  personal: "bg-blue-100 text-blue-800 border-blue-200",
  bereavement: "bg-blue-100 text-blue-800 border-blue-200",
  other: "bg-gray-100 text-gray-800 border-gray-200",
};

const INCIDENT_TYPES: IncidentType[] = ["late", "sick", "no_call_no_show", "medical_leave", "personal", "bereavement", "other"];

function AttendanceIncidentsCard({ agentId, employeeId, creatorEmployeeId }: { agentId: string; employeeId: string; creatorEmployeeId: string }) {
  const { data: incidents = [], isLoading } = useAgentIncidents(agentId);
  const createIncident = useCreateIncident();
  const updateIncident = useUpdateIncident();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AttendanceIncident | null>(null);
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formType, setFormType] = useState<IncidentType>("late");
  const [formNotes, setFormNotes] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setEditTarget(null);
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormType("late");
    setFormNotes("");
    setFormFile(null);
    setDialogOpen(true);
  };

  const openEdit = (incident: AttendanceIncident) => {
    setEditTarget(incident);
    setFormDate(incident.date);
    setFormType(incident.incident_type);
    setFormNotes(incident.notes || "");
    setFormFile(null);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editTarget) {
      updateIncident.mutate(
        {
          id: editTarget.id,
          employeeId,
          incidentType: formType,
          notes: formNotes || null,
          file: formFile || undefined,
        },
        {
          onSuccess: () => {
            toast.success("Incident updated");
            setDialogOpen(false);
          },
          onError: (err) => toast.error((err as Error).message),
        }
      );
    } else {
      createIncident.mutate(
        {
          employeeId,
          date: formDate,
          incidentType: formType,
          notes: formNotes || undefined,
          file: formFile || undefined,
          creatorEmployeeId,
        },
        {
          onSuccess: () => {
            toast.success("Incident logged");
            setDialogOpen(false);
          },
          onError: (err) => toast.error((err as Error).message),
        }
      );
    }
  };

  const handleViewDoc = async (filePath: string) => {
    try {
      const url = await getIncidentDocSignedUrl(filePath);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to generate view link");
    }
  };

  const isSaving = createIncident.isPending || updateIncident.isPending;
  const [showAllIncidents, setShowAllIncidents] = useState(false);
  const VISIBLE_LIMIT = 5;
  const visibleIncidents = showAllIncidents ? incidents : incidents.slice(0, VISIBLE_LIMIT);
  const hiddenCount = incidents.length - VISIBLE_LIMIT;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Attendance Incidents
              {incidents.length > 0 && (
                <Badge variant="secondary" className="text-xs">{incidents.length}</Badge>
              )}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="mr-1 h-3 w-3" /> Log incident
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <LogoLoadingIndicator size="sm" />}
          {!isLoading && incidents.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No attendance incidents on record.</p>
          )}
          {visibleIncidents.map((incident) => (
            <div key={incident.id} className="flex items-start justify-between gap-3 border-l-2 border-muted pl-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${INCIDENT_COLORS[incident.incident_type]}`}>
                    {INCIDENT_TYPE_LABELS[incident.incident_type]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateMX(incident.date)}
                  </span>
                  {incident.creator?.full_name && (
                    <span className="text-xs text-muted-foreground">— {incident.creator.full_name}</span>
                  )}
                </div>
                {incident.notes && <p className="text-sm">{incident.notes}</p>}
                {incident.supporting_doc_path && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleViewDoc(incident.supporting_doc_path!)}>
                    <Eye className="mr-1 h-3 w-3" /> View document
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(incident)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {!showAllIncidents && hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setShowAllIncidents(true)}
            >
              Ver {hiddenCount} más
            </Button>
          )}
          {showAllIncidents && incidents.length > VISIBLE_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setShowAllIncidents(false)}
            >
              Mostrar menos
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Log / Edit incident dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Incident" : "Log Incident"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="incident-date">Date</Label>
              <Input
                id="incident-date"
                autoFocus
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                disabled={!!editTarget}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as IncidentType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>{INCIDENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="incident-notes">Notes</Label>
              <Textarea
                id="incident-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Context or details..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>Supporting document (optional)</Label>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_DOCUMENT_EXTENSIONS}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
                onChange={(e) => setFormFile(e.target.files?.[0] || null)}
              />
              {editTarget?.supporting_doc_path && !formFile && (
                <p className="text-xs text-muted-foreground">Existing document attached. Upload a new file to replace.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !formDate}>
              {isSaving ? "Saving..." : editTarget ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── C1: Policy Acknowledgments Card (leadership only) ─────────────────

function PolicyAckCard({
  agentId,
  agentCampaignId,
  agentRole,
}: {
  agentId: string;
  agentCampaignId: string | null;
  agentRole?: string;
}) {
  const { data: policies = [] } = usePolicies();

  // Filter to policies applicable to this agent
  const applicable = policies.filter((p) => {
    if (!p.is_active) return false;
    if (!p.is_global && p.scoped_campaign_ids) {
      if (!agentCampaignId || !p.scoped_campaign_ids.includes(agentCampaignId)) return false;
    }
    if (p.applicable_roles && agentRole) {
      if (!p.applicable_roles.includes(agentRole)) return false;
    }
    return true;
  });

  // Fetch acks for this agent
  const { data: acks = [] } = useQuery({
    queryKey: ["agent-policy-acks", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policy_acknowledgments")
        .select("policy_document_version_id, acknowledged_at")
        .eq("employee_id", agentId);
      if (error) throw error;
      return data as { policy_document_version_id: string; acknowledged_at: string }[];
    },
    enabled: !!agentId,
  });

  const ackVersionIds = new Set(acks.map((a) => a.policy_document_version_id));

  if (applicable.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Policy Acknowledgments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {applicable.map((policy) => {
          const currentVersion = policy.current_version;
          let status: "acknowledged" | "not_acknowledged" = "not_acknowledged";
          let ackDate: string | null = null;

          if (currentVersion && ackVersionIds.has(currentVersion.id)) {
            status = "acknowledged";
            ackDate = acks.find((a) => a.policy_document_version_id === currentVersion.id)?.acknowledged_at ?? null;
          }

          return (
            <div key={policy.id} className="flex items-center justify-between gap-3 border-l-2 border-muted pl-3">
              <div>
                <p className="text-sm font-medium">{policy.title}</p>
                {currentVersion && (
                  <p className="text-xs text-muted-foreground">v{currentVersion.version_number}</p>
                )}
              </div>
              {status === "acknowledged" ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-xs">
                  Ack'd {ackDate ? formatDateMX(ackDate) : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 text-xs">
                  Not ack'd
                </Badge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
