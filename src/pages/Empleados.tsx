import { useState, useRef, useMemo, useEffect } from "react";
import { useEmployees, useAddEmployee, useAddEmployeesBulk, useActivePeriod, usePayrollRecords, recordToConfig, useInactiveEmployees, useReactivateEmployee, useCheckRehire, useResendInvite, type InactiveEmployeeRow } from "@/hooks/useSupabasePayroll";
import { useUpdateCandidate } from "@/hooks/useRecruiting";
import { calcularNomina, type Employee, type EmpTitle } from "@/types/payroll";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Upload, Plus, UserX, Download, ArrowUpDown, ChevronLeft, ChevronRight, AlertTriangle, RotateCcw, Mail } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClientCampaignPicker } from "@/components/ClientCampaignPicker";
import { TerminateEmployeeDialog } from "@/components/TerminateEmployeeDialog";
import { useAuth } from "@/hooks/useAuth";

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "MXN" });

const PAGE_OPTIONS = [15, 30, 60, 100];

// Anyone with a hire_date within this window is considered a "New Hire"
// and shows up in the New Hires tab. After day 30 they auto-move to Active.
const NEW_HIRE_WINDOW_DAYS = 30;

// Days since hire (whole days, local time). Returns null if no hire date.
function daysSinceHire(hireDate: string | null | undefined): number | null {
  if (!hireDate) return null;
  const start = new Date(hireDate);
  if (isNaN(start.getTime())) return null;
  const today = new Date();
  // Normalize both to midnight so we count whole days.
  const ms = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.floor(ms / 86_400_000);
}

type View = "active" | "new_hires" | "inactive";

export default function Empleados() {
  const { isLeadership } = useAuth();
  const { data: employees = [], isLoading } = useEmployees();
  const { data: inactive = [], isLoading: isLoadingInactive } = useInactiveEmployees();
  const { data: activePeriod } = useActivePeriod();
  const { data: records = [] } = usePayrollRecords(activePeriod?.id);
  const addEmployee = useAddEmployee();
  const addEmployeesBulk = useAddEmployeesBulk();
  const reactivate = useReactivateEmployee();
  const checkRehire = useCheckRehire();
  const resendInvite = useResendInvite();
  const updateCandidate = useUpdateCandidate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // "Hire from candidate" context — set when arriving from /empleados?hireFromCandidate=<id>.
  // Carries the attachments + linkage we need to copy onto the new employee row.
  const [hireFromCandidate, setHireFromCandidate] = useState<{
    id: string;
    full_name: string | null;
    curp: string | null;
    phone: string | null;
    email: string | null;
    cv_url: string | null;
    presentation_url: string | null;
  } | null>(null);
  const [view, setView] = useState<View>("active");
  const [sortAsc, setSortAsc] = useState(true);
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Open termination dialog for a specific row
  const [terminateTarget, setTerminateTarget] = useState<{ id: string; nombre: string } | null>(null);

  // Add Employee wizard: step 1 = identity check, step 2 = full form.
  const [addStep, setAddStep] = useState<"identity" | "form">("identity");
  const [skippedCheck, setSkippedCheck] = useState(false);

  // Matches found in the identity step — rendered inline, not as a separate modal.
  const [rehireMatches, setRehireMatches] = useState<any[] | null>(null);

  // Active-employee duplicate matches found at form submission time.
  // null = not checked yet / cleared. Array = warning shown, user must confirm.
  const [duplicateWarning, setDuplicateWarning] = useState<any[] | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    email: "",
    personalEmail: "",
    curp: "",
    dateOfBirth: "",
    sueldoBase: 0,
    descuentoPorDia: 0,
    kpiMonto: 0,
    title: "agent" as EmpTitle,
    clientId: null as string | null,
    campaignId: null as string | null,
  });

  // Split active employees by tenure. _hireDate < 30 days → New Hires tab.
  // Anyone with no hire_date stays in Active (probably an older record).
  const { newHires, tenuredActive } = useMemo(() => {
    const nh: typeof employees = [];
    const ta: typeof employees = [];
    for (const e of employees) {
      const days = daysSinceHire(e._hireDate);
      if (days !== null && days < NEW_HIRE_WINDOW_DAYS) {
        nh.push(e);
      } else {
        ta.push(e);
      }
    }
    return { newHires: nh, tenuredActive: ta };
  }, [employees]);

  // When a search is active, combine all active employees so the search spans all tabs.
  // When not searching, respect the current tab selection.
  const isSearching = search.trim().length > 0;
  const sourceList = useMemo(() => {
    if (isSearching) return [...tenuredActive, ...newHires];
    return view === "new_hires" ? newHires : tenuredActive;
  }, [isSearching, view, tenuredActive, newHires]);

  // Active / New Hires employees — filter, sort, and paginate
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = sourceList.filter(
      (e) =>
        e.nombre.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e._campaignName || "").toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      // New Hires: sort by days-in ascending so the freshest hire is last
      // (or descending — let's go ascending so day 1 is at the top: most urgent
      // to acclimate). Falls back to name sort for ties / non-new-hire view.
      if (view === "new_hires") {
        const da = daysSinceHire(a._hireDate) ?? 999;
        const db = daysSinceHire(b._hireDate) ?? 999;
        if (da !== db) return sortAsc ? da - db : db - da;
      }
      const cmp = a.nombre.localeCompare(b.nombre, "es");
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [sourceList, search, sortAsc, view]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Inactive employees — separate filter (no payroll math, no pagination needed yet)
  const inactiveFiltered = useMemo<InactiveEmployeeRow[]>(() => {
    const q = search.toLowerCase();
    return inactive.filter(
      (e) =>
        (e.full_name || "").toLowerCase().includes(q) ||
        (e.employee_id || "").toLowerCase().includes(q) ||
        ((e as any).campaigns?.name || "").toLowerCase().includes(q)
    );
  }, [inactive, search]);

  // Reset to page 1 when search or page size changes
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };
  const handlePageSizeChange = (val: string) => {
    setPageSize(Number(val));
    setCurrentPage(1);
  };

  const resetForm = () => {
    setForm({
      nombre: "",
      email: "",
      personalEmail: "",
      curp: "",
      dateOfBirth: "",
      sueldoBase: 0,
      descuentoPorDia: 0,
      kpiMonto: 0,
      title: "agent",
      clientId: null,
      campaignId: null,
    });
    setAddStep("identity");
    setSkippedCheck(false);
    setRehireMatches(null);
    setDuplicateWarning(null);
    setHireFromCandidate(null);
  };

  // Auto-open the Add Employee dialog when arriving from a candidate drawer.
  // Reads ?hireFromCandidate=<id>, fetches the candidate, prefills name/CURP,
  // opens the wizard on step 1 (identity check) — same as a manual add.
  // We don't auto-run the rehire check; the existing button still gates that
  // so leadership consciously confirms there's no prior record.
  const candidateParam = searchParams.get("hireFromCandidate");
  useEffect(() => {
    if (!candidateParam) return;
    if (hireFromCandidate?.id === candidateParam) return; // already loaded

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("recruiting_candidates")
        .select("id, full_name, curp, phone, email, cv_url, presentation_url")
        .eq("id", candidateParam)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Couldn't load candidate — opening blank form instead.");
        // Drop the param so we don't keep retrying on every render.
        searchParams.delete("hireFromCandidate");
        setSearchParams(searchParams, { replace: true });
        return;
      }
      setHireFromCandidate(data);
      setForm((f) => ({
        ...f,
        nombre: data.full_name ?? "",
        curp: data.curp ?? "",
        // Personal email isn't captured by the recruiting form today, but if it
        // ever is we'll prefill it. Never prefill `email` (work email) — that's
        // assigned by HR after hire.
        personalEmail: data.email ?? "",
      }));
      setAddStep("identity");
      setAddOpen(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateParam]);

  const doCreateEmployee = () => {
    if (!form.nombre) {
      toast.error("Name is required");
      return;
    }

    // Duplicate check against active employees — runs on first attempt only.
    // If duplicateWarning is already set the user already saw it and clicked again → proceed.
    if (duplicateWarning === null) {
      const nameNorm = form.nombre.trim().toLowerCase();
      const emailNorm = form.email.trim().toLowerCase();

      const dupes = employees.filter((e) => {
        // Exact email match (case-insensitive)
        if (emailNorm && (e._email || "").toLowerCase() === emailNorm) return true;
        // Name similarity: 2+ meaningful words in common catches "Oscar Pedrazzini" vs
        // "Oscar Andres Pedrazzini Herrera" while ignoring accidental single-word hits.
        const aWords = nameNorm.split(/\s+/).filter((w) => w.length > 2);
        const bWords = e.nombre.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        const shared = aWords.filter((w) => bWords.includes(w));
        return shared.length >= 2;
      });

      if (dupes.length > 0) {
        setDuplicateWarning(dupes);
        return; // stop here — let the user decide
      }
    }

    setDuplicateWarning(null);
    // Work email is optional — common workflow is to create the profile first
    // and add the work email a week later once the hire is confirmed. The
    // useAddEmployee hook handles both paths (with-email = auth user + invite,
    // without-email = plain employee row).
    const emailTrimmed = form.email.trim();
    const todayLocal = new Date();
    const todayISO = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;
    addEmployee.mutate(
      {
        nombre: form.nombre,
        sueldoBase: form.sueldoBase,
        descuentoPorDia: form.descuentoPorDia,
        kpiMonto: form.kpiMonto,
        title: form.title,
        email: emailTrimmed || undefined,
        personalEmail: form.personalEmail.trim() || null,
        campaignId: form.campaignId,
        // Hire-from-candidate extras (all null for a manual add):
        curp: form.curp.trim() || hireFromCandidate?.curp || null,
        phone: hireFromCandidate?.phone || null,
        cvUrl: hireFromCandidate?.cv_url || null,
        introRecordingUrl: hireFromCandidate?.presentation_url || null,
        recruitedFromCandidateId: hireFromCandidate?.id || null,
        // Stamp hire_date today only when we're hiring from a candidate.
        // Manual adds without a candidate keep the legacy behaviour
        // (HR sets hire_date later from the employee profile).
        hireDate: hireFromCandidate ? todayISO : null,
      },
      {
        onSuccess: (data) => {
          toast.success(`Employee added — ID: ${data.employee_id}`);
          setAddOpen(false);

          // If this came from a candidate, also flip the candidate row to Hired.
          // Don't block the toast/navigation on this — if it fails we surface
          // a separate toast and let the user fix it from the candidate drawer.
          if (hireFromCandidate) {
            const candidateId = hireFromCandidate.id;
            const titleAtHire = form.title;
            updateCandidate.mutate(
              {
                id: candidateId,
                patch: {
                  stage: "hired",
                  final_status: "hired",
                  hired_at: new Date().toISOString(),
                  hired_for_role: titleAtHire,
                },
              },
              {
                onError: (err: any) =>
                  toast.error(
                    `Employee created, but couldn't update the candidate record: ${err?.message ?? "unknown error"}`,
                  ),
              },
            );
            // Clean the URL so a reload won't reopen the dialog.
            searchParams.delete("hireFromCandidate");
            setSearchParams(searchParams, { replace: true });
            resetForm();
            navigate(`/empleados/${data.employee_id}`);
            return;
          }

          resetForm();
        },
        onError: (err: any) => toast.error(err.message || "Error adding employee"),
      }
    );
  };

  // Step 1: identity precheck. Either CURP or (name + DOB) is required —
  // there's no point hitting the RPC with nothing to match on.
  const runIdentityCheck = async () => {
    const curp = form.curp.trim();
    const name = form.nombre.trim();
    const dob = form.dateOfBirth;
    if (!curp && !(name && dob)) {
      toast.error("Enter CURP, or name + date of birth, to check.");
      return;
    }
    try {
      const matches = await checkRehire.mutateAsync({
        curp: curp || null,
        fullName: name || null,
        dateOfBirth: dob || null,
      });
      if (matches && matches.length > 0) {
        // Dedupe: same person can match by both CURP and (name+DOB).
        // Collapse to one row per employee and merge the match_type into a list.
        const byId = new Map<string, any>();
        for (const m of matches) {
          const existing = byId.get(m.id);
          if (existing) {
            existing._matchTypes = Array.from(
              new Set([...(existing._matchTypes ?? [existing.match_type]), m.match_type])
            );
          } else {
            byId.set(m.id, { ...m, _matchTypes: [m.match_type] });
          }
        }
        setRehireMatches(Array.from(byId.values()));
        // stay on identity step so HR can decide
      } else {
        toast.success("No past records found — go ahead.");
        setRehireMatches(null);
        setSkippedCheck(false);
        setAddStep("form");
      }
    } catch (err: any) {
      // Don't block — let HR proceed but flag that the check failed.
      console.warn("Rehire check failed:", err?.message);
      toast.error("Couldn't check records right now — proceed with caution.");
      setSkippedCheck(true);
      setAddStep("form");
    }
  };

  // Step 1 escape hatch — HR doesn't have docs yet, wants to fill in basics first.
  const skipIdentityCheck = () => {
    setSkippedCheck(true);
    setRehireMatches(null);
    setAddStep("form");
  };

  // From the match card — bypass and create a new record anyway.
  const proceedToFormDespiteMatch = () => {
    setRehireMatches(null);
    setSkippedCheck(false);
    setAddStep("form");
  };

  const handleReactivate = (employeeId: string, name: string) => {
    reactivate.mutate(employeeId, {
      onSuccess: () => {
        toast.success(`${name} reactivated — they're back on the active roster.`);
        setAddOpen(false);
        resetForm();
      },
      onError: (err: any) => toast.error(err?.message || "Failed to reactivate"),
    });
  };

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      const emps: Employee[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (cols.length >= 5) {
          emps.push({
            id: cols[0],
            nombre: cols[1],
            sueldoBase: parseFloat(cols[2]) || 0,
            descuentoPorDia: parseFloat(cols[3]) || 0,
            kpiMonto: parseFloat(cols[4]) || 0,
          });
        }
      }
      if (emps.length) {
        addEmployeesBulk.mutate(emps, {
          onSuccess: () => toast.success(`${emps.length} employees imported`),
          onError: (err: any) => toast.error(err.message || "Error importing employees"),
        });
      } else {
        toast.error("No valid records found");
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LogoLoadingIndicator /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Employee Management</h2>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
          <Button variant="outline" onClick={() => {
            const header = "ID,Name,BaseSalary,DailyDiscount,KPI";
            const example = "EMP001,Juan Perez,15000,500,1000";
            const blob = new Blob([header + "\n" + example + "\n"], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "employee_template.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}>
            <Download className="mr-2 h-4 w-4" /> CSV Template
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Upload CSV
          </Button>
          <Dialog open={addOpen} onOpenChange={(o) => {
            setAddOpen(o);
            if (!o) {
              resetForm();
              // If the dialog was opened from a candidate, drop the param so
              // refreshing the page doesn't immediately reopen it.
              if (searchParams.get("hireFromCandidate")) {
                searchParams.delete("hireFromCandidate");
                setSearchParams(searchParams, { replace: true });
              }
            }
          }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Employee</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              {addStep === "identity" ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Add Employee · Step 1 of 2</DialogTitle>
                    <DialogDescription>
                      Check first if we have this person on file. Saves you typing the whole record only to find out they're flagged Do Not Rehire.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                      <Label>Full Name</Label>
                      <Input
                        placeholder="Juan Perez"
                        value={form.nombre}
                        onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                        autoComplete="off"
                        name="rehire-check-name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-2">
                        <Label>CURP</Label>
                        <Input
                          placeholder="ABCD123456HDFGHI01"
                          value={form.curp}
                          onChange={(e) => setForm({ ...form, curp: e.target.value.toUpperCase() })}
                          maxLength={18}
                          autoComplete="off"
                          name="rehire-check-curp"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Date of Birth</Label>
                        <Input
                          type="date"
                          value={form.dateOfBirth}
                          onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                          autoComplete="off"
                          name="rehire-check-dob"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2 break-words">
                      You need <strong>CURP</strong>, or <strong>Name + Date of Birth</strong>.
                      <br />
                      Name alone won't search — too many duplicates.
                    </p>

                    {/* Match results */}
                    {rehireMatches && rehireMatches.length > 0 && (
                      <div className="space-y-3">
                        {rehireMatches.some((m: any) => m.rehire_eligible === false) ? (
                          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <div className="font-semibold">Match found — flagged Do Not Rehire</div>
                              <div className="text-xs mt-0.5">Strongly recommend you don't add this person.</div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                            <div>
                              <div className="font-semibold text-amber-700">We've had this person on the books before</div>
                              <div className="text-xs mt-0.5 text-muted-foreground">Reactivate the old record instead of creating a duplicate.</div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {rehireMatches.map((m: any) => (
                            <div key={m.id} className="rounded-md border p-3 text-sm space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-medium min-w-0 break-words">
                                  {m.full_name}{" "}
                                  <span className="text-muted-foreground font-normal">({m.employee_id})</span>
                                </div>
                                {m.rehire_eligible === false ? (
                                  <Badge variant="destructive" className="shrink-0">Do Not Rehire</Badge>
                                ) : m.rehire_eligible === true ? (
                                  <Badge variant="outline" className="border-green-600 text-green-700 shrink-0">Rehire OK</Badge>
                                ) : (
                                  <Badge variant="outline" className="shrink-0">Needs Review</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Matched by{" "}
                                <span className="font-medium">
                                  {(m._matchTypes ?? [m.match_type])
                                    .map((t: string) => (t === "curp" ? "CURP" : "Name + DOB"))
                                    .join(" + ")}
                                </span>{" "}
                                · Status: {m.employment_status}
                              </div>
                              {m.termination_reason && (
                                <div className="text-xs text-muted-foreground">Reason: {m.termination_reason}</div>
                              )}
                              {m.termination_notes && (
                                <div className="text-xs italic text-muted-foreground">"{m.termination_notes}"</div>
                              )}
                              {m.rehire_eligible !== false && (
                                <Button
                                  size="sm"
                                  className="mt-1"
                                  onClick={() => handleReactivate(m.employee_id, m.full_name)}
                                  disabled={reactivate.isPending}
                                >
                                  <RotateCcw className="mr-1 h-3 w-3" />
                                  Reactivate this record
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter className="flex-col sm:flex-row gap-2 flex-wrap">
                    <Button
                      variant="link"
                      size="sm"
                      className="sm:mr-auto text-muted-foreground whitespace-normal text-left h-auto py-1"
                      onClick={skipIdentityCheck}
                    >
                      Don't have these yet — skip and continue
                    </Button>
                    {rehireMatches && rehireMatches.length > 0 ? (
                      <Button
                        variant={rehireMatches.some((m: any) => m.rehire_eligible === false) ? "destructive" : "outline"}
                        className="whitespace-normal h-auto py-2"
                        onClick={proceedToFormDespiteMatch}
                      >
                        {rehireMatches.some((m: any) => m.rehire_eligible === false)
                          ? "Add as new anyway (override DNR)"
                          : "Add as new anyway"}
                      </Button>
                    ) : (
                      <Button onClick={runIdentityCheck} disabled={checkRehire.isPending}>
                        {checkRehire.isPending ? "Checking..." : "Check Records"}
                      </Button>
                    )}
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Add Employee · Step 2 of 2</DialogTitle>
                    <DialogDescription>
                      {form.nombre ? <>Adding <span className="font-medium text-foreground">{form.nombre}</span>. </> : null}
                      Fill in pay and assignment details.
                    </DialogDescription>
                  </DialogHeader>

                  {skippedCheck && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Rehire check skipped. Fill in CURP later when docs arrive so future hires can be checked against this record.</span>
                    </div>
                  )}

                  <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                      <Label>Full Name</Label>
                      <Input
                        value={form.nombre}
                        onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                        autoComplete="off"
                        name="new-emp-name"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Work Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input
                        type="email"
                        placeholder="name@yourdomain.com"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        autoComplete="off"
                        name="new-emp-work-email"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used for login, password resets, and account verification. Use the company-issued address, not a personal one. Leave blank if you want to add it later (e.g. after the new hire is confirmed) — you can set it from their profile and then send the invite.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label>Personal Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input
                        type="email"
                        placeholder="name@gmail.com"
                        value={form.personalEmail}
                        onChange={(e) => setForm({ ...form, personalEmail: e.target.value })}
                        autoComplete="off"
                        name="new-emp-personal-email"
                      />
                      <p className="text-xs text-muted-foreground">
                        For HR contact only. Never used for login or password resets.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-2">
                        <Label>Monthly Base Salary</Label>
                        <Input
                          type="number"
                          value={form.sueldoBase || ""}
                          onChange={(e) => setForm({ ...form, sueldoBase: parseFloat(e.target.value) || 0 })}
                          autoComplete="off"
                          name="new-emp-salary"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Daily Absence Discount</Label>
                        <Input
                          type="number"
                          value={form.descuentoPorDia || ""}
                          onChange={(e) => setForm({ ...form, descuentoPorDia: parseFloat(e.target.value) || 0 })}
                          autoComplete="off"
                          name="new-emp-discount"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>KPI Bonus Amount</Label>
                      <Input
                        type="number"
                        value={form.kpiMonto || ""}
                        onChange={(e) => setForm({ ...form, kpiMonto: parseFloat(e.target.value) || 0 })}
                        autoComplete="off"
                        name="new-emp-kpi"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Title</Label>
                      <Select value={form.title} onValueChange={(v) => setForm({ ...form, title: v as EmpTitle })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="team_lead">Team Lead</SelectItem>
                          <SelectItem value="agent">Agent</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Title controls what they see in the app. Most hires are Agents.
                      </p>
                    </div>
                    <ClientCampaignPicker
                      value={{ clientId: form.clientId, campaignId: form.campaignId }}
                      onChange={({ clientId, campaignId }) =>
                        setForm((f) => ({ ...f, clientId, campaignId }))
                      }
                    />
                  </div>

                  {/* Duplicate warning — shown when active employees with similar name/email found */}
                  {duplicateWarning && duplicateWarning.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                      <div className="flex items-start gap-2 text-sm text-amber-700">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span className="font-medium">Possible duplicate — {duplicateWarning.length} active employee{duplicateWarning.length > 1 ? "s" : ""} already match this name or email:</span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {duplicateWarning.map((e) => (
                          <div key={e.id} className="rounded border bg-background px-3 py-2 text-sm flex items-center justify-between gap-2">
                            <div>
                              <span className="font-medium">{e.nombre}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{e.id}</span>
                              {e._campaignName && <span className="text-muted-foreground ml-2 text-xs">· {e._campaignName}</span>}
                            </div>
                            <Button variant="ghost" size="sm" className="text-xs h-7 px-2 shrink-0"
                              onClick={() => { setAddOpen(false); resetForm(); navigate(`/empleados/${e.id}`); }}>
                              View
                            </Button>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-amber-700">Is this a different person? Click <strong>Add anyway</strong> below to continue.</p>
                    </div>
                  )}

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAddStep("identity")}
                      disabled={addEmployee.isPending}
                    >
                      Back
                    </Button>
                    <Button
                      onClick={doCreateEmployee}
                      disabled={addEmployee.isPending}
                      variant={duplicateWarning ? "destructive" : "default"}
                    >
                      {addEmployee.isPending ? "Saving..." : duplicateWarning ? "Add anyway" : "Add Employee"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLeadership && (
        <Tabs value={view} onValueChange={(v) => { setView(v as View); setCurrentPage(1); }}>
          <TabsList>
            <TabsTrigger value="active">
              Active ({tenuredActive.length})
            </TabsTrigger>
            <TabsTrigger value="new_hires">
              New Hires ({newHires.length})
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive ({inactive.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={
            view === "inactive"
              ? "Search past employees..."
              : view === "new_hires"
                ? "Search new hires..."
                : "Search by name, ID, or campaign..."
          }
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
          autoComplete="off"
          name="empleados-search"
        />
      </div>

      {(view === "active" || view === "new_hires" || isSearching) && (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>
                  <button
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => setSortAsc((prev) => !prev)}
                  >
                    Name
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>Campaign</TableHead>
                {view === "new_hires" && !isSearching && <TableHead>Day</TableHead>}
                <TableHead className="text-right">Base Salary</TableHead>
                <TableHead className="text-right">Biweekly Net</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {view === "new_hires" && !isSearching
                      ? "No new hires in the last 30 days."
                      : isSearching ? "No employees matched your search."
                      : "No employees found"}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((emp) => {
                  // Phase 4b: calcularNomina() was removed (throws now).
                  // Per-employee net pay lives at /admin/payroll/agent/:id.
                  // Show "—" until Phase 4c retires this column entirely.
                  const days = daysSinceHire(emp._hireDate);
                  return (
                    <TableRow key={emp.id} className="cursor-pointer" onClick={() => navigate(`/empleados/${emp.id}`)}>
                      <TableCell className="font-medium">{emp.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{emp.nombre}</span>
                          {/* Reminder: this employee has no hire_date set.
                              Without it they can't appear in the New Hires tab. */}
                          {view === "active" && !emp._hireDate && (
                            <Badge
                              variant="outline"
                              className="border-amber-500 text-amber-700 gap-1 text-xs font-normal"
                              title="No hire date on file — add one from this employee's profile so they appear in New Hires during their first 30 days."
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Set hire date
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{(emp as any)._campaignName || "—"}</TableCell>
                      {view === "new_hires" && !isSearching && days !== null && (
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              days >= 25
                                ? "border-green-600 text-green-700"
                                : days >= 14
                                  ? "border-amber-500 text-amber-700"
                                  : ""
                            }
                          >
                            Day {days + 1} / {NEW_HIRE_WINDOW_DAYS}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="text-right">{fmt(emp.sueldoBase)}</TableCell>
                      <TableCell className="text-right font-semibold text-muted-foreground">—</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Send welcome / invite email"
                            disabled={resendInvite.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              const uuid = (emp as any)._uuid as string | undefined;
                              if (!uuid) {
                                toast.error("Missing employee UUID");
                                return;
                              }
                              resendInvite.mutate([uuid], {
                                onSuccess: (data) => {
                                  const r = data.results[0];
                                  if (r.status === "sent") toast.success(`Invite sent to ${r.email}`);
                                  else if (r.status === "skipped") toast.info(`Skipped: ${r.message}`);
                                  else toast.error(`Failed: ${r.message}`);
                                },
                                onError: (err) => toast.error((err as Error).message),
                              });
                            }}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Offboard employee"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTerminateTarget({ id: emp.id, nombre: emp.nombre });
                            }}
                          >
                            <UserX className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {(view === "inactive" || (isSearching && inactiveFiltered.length > 0)) && (
        <>
        {isSearching && view !== "inactive" && (
          <p className="text-sm font-medium text-muted-foreground -mb-2 mt-2">
            Also found in Inactive ({inactiveFiltered.length})
          </p>
        )}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Rehire?</TableHead>
                  <TableHead>Last Day</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingInactive ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : inactiveFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No past employees on file.
                    </TableCell>
                  </TableRow>
                ) : (
                  inactiveFiltered.map((emp) => (
                    <TableRow key={emp.id} className="cursor-pointer" onClick={() => navigate(`/empleados/${emp.employee_id}`)}>
                      <TableCell className="font-medium">{emp.employee_id}</TableCell>
                      <TableCell>{emp.full_name}</TableCell>
                      <TableCell>
                        <Badge variant={emp.employment_status === "terminated" ? "destructive" : "secondary"}>
                          {statusLabel(emp.employment_status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[260px] truncate" title={emp.termination_reason || ""}>
                        {emp.termination_reason || <span className="italic">— needs review —</span>}
                      </TableCell>
                      <TableCell>
                        {emp.rehire_eligible === true && <Badge variant="outline" className="border-green-600 text-green-700">Yes</Badge>}
                        {emp.rehire_eligible === false && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Do Not Rehire
                          </Badge>
                        )}
                        {emp.rehire_eligible == null && <Badge variant="outline">Review</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {emp.last_worked_day || emp.terminated_at?.slice(0, 10) || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reactivate"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReactivate(emp.employee_id, emp.full_name);
                          }}
                          disabled={reactivate.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}

      {/* Pagination — for active + new hires views; inactive list is short */}
      {(view === "active" || view === "new_hires" || isSearching) && (
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span>
          <span className="mx-2">|</span>
          <span>Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === safePage ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(p)}
            >
              {p}
            </Button>
          ))}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      )}

      {/* Termination dialog */}
      {terminateTarget && (
        <TerminateEmployeeDialog
          open={!!terminateTarget}
          onOpenChange={(o) => { if (!o) setTerminateTarget(null); }}
          employee={terminateTarget}
        />
      )}

    </div>
  );
}

function statusLabel(s: string | null | undefined): string {
  switch (s) {
    case "terminated": return "Terminated";
    case "resigned":   return "Resigned";
    case "on_leave":   return "On Leave";
    case "active":     return "Active";
    default:           return s || "—";
  }
}
