import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, titleLabel } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { PersonalInfoCard } from "@/components/employee-profile/PersonalInfoCard";
import { formatDateMXLong } from "@/lib/localDate";

export default function Account() {
  const { user, title, employeeId, isClient } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Load the agent's own 5 contact fields (RLS agents_select_own_employee allows it).
  // Clients (no employeeId) skip this entirely.
  const { data: myInfo } = useQuery({
    queryKey: ["my-personal-info", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("id, work_name, personal_email, phone, address, emergency_contact, date_of_birth, marital_status, hire_date, last_worked_day, bank_name, bank_clabe, curp, rfc, nss, department_id, departments(name)")
        .eq("id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        work_name: string | null;
        personal_email: string | null;
        phone: string | null;
        address: string | null;
        emergency_contact: string | null;
        date_of_birth: string | null;
        marital_status: string | null;
        hire_date: string | null;
        last_worked_day: string | null;
        bank_name: string | null;
        bank_clabe: string | null;
        curp: string | null;
        rfc: string | null;
        nss: string | null;
        department_id: string | null;
        departments: { name: string } | null;
      };
    },
    enabled: !!employeeId && !isClient,
  });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setUpdating(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reset link sent — check your email");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Account</h2>
        <p className="text-muted-foreground text-sm">Manage your login and password</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Info</CardTitle>
          <CardDescription>Read-only. Ask an admin if anything needs to change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <p className="text-sm font-medium">{user?.email ?? "—"}</p>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <p className="text-sm font-medium">{title ? titleLabel(title) : "—"}</p>
          </div>
        </CardContent>
      </Card>

      {employeeId && !isClient && myInfo && (
        <PersonalInfoCard
          employeeUuid={myInfo.id}
          initialWorkName={myInfo.work_name ?? ""}
          initialPersonalEmail={myInfo.personal_email ?? ""}
          initialPhone={myInfo.phone ?? ""}
          initialAddress={myInfo.address ?? ""}
          initialEmergencyContact={myInfo.emergency_contact ?? ""}
          description="Update your own contact info. Your work email, role, and pay are managed by HR."
        />
      )}

      {employeeId && !isClient && myInfo && (
        <HrRecordCard info={myInfo} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Change Password</CardTitle>
          <CardDescription>At least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" disabled={updating}>
              {updating ? "Updating..." : "Update Password"}
            </Button>
          </form>

          <Separator className="my-6" />

          <div className="space-y-2">
            <p className="text-sm font-medium">Forgot your current password?</p>
            <p className="text-xs text-muted-foreground">
              We'll email you a secure link to set a new one without needing the old password.
            </p>
            <Button variant="outline" onClick={handleSendResetEmail} disabled={sendingReset || !user?.email}>
              {sendingReset ? "Sending..." : "Send me a reset link"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── HR Record card (read-only, masked) ────────────────────────────────────────
// Shows the fields HR manages: DOB, hire date, bank info, tax IDs, etc.
// Same Show/Hide pattern as PersonalInfoCard — hidden by default, auto-hides
// after 30 s of inactivity.

const AUTO_HIDE_MS = 30_000;
const MASK = "••••••••••";

type HrInfo = {
  date_of_birth: string | null;
  marital_status: string | null;
  hire_date: string | null;
  last_worked_day: string | null;
  bank_name: string | null;
  bank_clabe: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  departments: { name: string } | null;
};

function HrRecordCard({ info }: { info: HrInfo }) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armHide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), AUTO_HIDE_MS);
  };
  const handleReveal = () => { setShow(true); armHide(); };
  const handleHide  = () => { if (timer.current) clearTimeout(timer.current); setShow(false); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Only render the card if there's at least one HR field on record.
  const hasAny = !!(
    info.date_of_birth || info.marital_status || info.hire_date ||
    info.last_worked_day || info.bank_name || info.bank_clabe ||
    info.curp || info.rfc || info.nss || info.departments?.name
  );
  if (!hasAny) return null;

  const MaskedField = ({ value }: { value: string | null }) => (
    <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground select-none">
      {value ? MASK : <span className="italic opacity-70">Not on record</span>}
    </div>
  );

  const Row = ({ label, value, formatted }: { label: string; value: string | null; formatted?: string }) => (
    <div className="grid gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {show
        ? <p className="text-sm font-medium min-h-[40px] flex items-center">{formatted ?? value ?? <span className="italic text-muted-foreground">Not on record</span>}</p>
        : <MaskedField value={value} />
      }
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">HR Record</CardTitle>
            <CardDescription>
              Your employment details on file. Contact HR to update anything here.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={show ? handleHide : handleReveal}
            aria-pressed={show}
            className="shrink-0"
          >
            {show ? <><EyeOff className="mr-2 h-4 w-4" />Hide</> : <><Eye className="mr-2 h-4 w-4" />Show</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!show && (
          <p className="text-xs text-muted-foreground">
            Your HR record is hidden. Click <span className="font-medium">Show</span> to view. Auto-hides after 30 seconds.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {info.departments?.name && (
            <Row label="Department" value={info.departments.name} />
          )}
          {info.hire_date && (
            <Row label="Hire Date" value={info.hire_date} formatted={formatDateMXLong(info.hire_date)} />
          )}
          {info.date_of_birth && (
            <Row label="Date of Birth" value={info.date_of_birth} formatted={formatDateMXLong(info.date_of_birth)} />
          )}
          {info.marital_status && (
            <Row label="Marital Status" value={info.marital_status} />
          )}
          {info.last_worked_day && (
            <Row label="Last Worked Day" value={info.last_worked_day} formatted={formatDateMXLong(info.last_worked_day)} />
          )}
          {info.bank_name && (
            <Row label="Bank" value={info.bank_name} />
          )}
          {info.bank_clabe && (
            <Row label="CLABE" value={info.bank_clabe} />
          )}
          {info.curp && (
            <Row label="CURP" value={info.curp} />
          )}
          {info.rfc && (
            <Row label="RFC" value={info.rfc} />
          )}
          {info.nss && (
            <Row label="NSS (IMSS)" value={info.nss} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
