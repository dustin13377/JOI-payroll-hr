import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Save } from "lucide-react";
import { toast } from "sonner";
import { useUpdateEmployeePersonalInfo } from "@/hooks/useSupabasePayroll";

// Auto-hide sensitive fields after this much idle time once revealed.
const AUTO_HIDE_MS = 30_000;
const MASK = "••••••••••";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10}$/;

/**
 * Personal Info card — edit the 5 contact fields:
 *   work_name, personal_email, phone, address, emergency_contact
 *
 * Used in two places:
 *  - TL viewing one of their agents on /empleados/:id
 *  - Agent viewing their own /cuenta page
 *
 * Sensitive fields (DOB, marital status, hire date, salary, role) are NOT
 * here — they live on the leadership-only Employee Record card.
 *
 * Save calls the SECURITY DEFINER RPC update_employee_personal_info, which
 * does the real permission check server-side. So even if a TL had the UI
 * open for someone outside their team, the DB would reject the save.
 *
 * `description` lets the caller customize the help text (e.g. "Update your
 * own contact info" vs "Update contact info for agents on your team").
 */
export function PersonalInfoCard(props: {
  employeeUuid: string;
  initialWorkName: string;
  initialPersonalEmail: string;
  initialPhone: string;
  initialAddress: string;
  initialEmergencyContact: string;
  description?: string;
}) {
  const update = useUpdateEmployeePersonalInfo();

  const [form, setForm] = useState({
    work_name: props.initialWorkName || "",
    personal_email: props.initialPersonalEmail || "",
    phone: props.initialPhone || "",
    address: props.initialAddress || "",
    emergency_contact: props.initialEmergencyContact || "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Privacy mask: fields are hidden by default. Agent (or TL) clicks Show
  // to reveal. Auto-hides again after AUTO_HIDE_MS of no field interaction
  // so info doesn't sit on screen if they walk away.
  const [showSensitive, setShowSensitive] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armAutoHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowSensitive(false), AUTO_HIDE_MS);
  };
  const handleReveal = () => {
    setShowSensitive(true);
    armAutoHide();
  };
  const handleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowSensitive(false);
  };
  // Clear timer on unmount.
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // Don't clobber in-flight edits when initial props change from a refetch.
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    setForm({
      work_name: props.initialWorkName || "",
      personal_email: props.initialPersonalEmail || "",
      phone: props.initialPhone || "",
      address: props.initialAddress || "",
      emergency_contact: props.initialEmergencyContact || "",
    });
  }, [
    props.initialWorkName,
    props.initialPersonalEmail,
    props.initialPhone,
    props.initialAddress,
    props.initialEmergencyContact,
  ]);

  const setField = (k: keyof typeof form, v: string) => {
    dirty.current = true;
    setForm((f) => ({ ...f, [k]: v }));
    // Reset auto-hide whenever the user is actively typing.
    if (showSensitive) armAutoHide();
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.personal_email && !EMAIL_RE.test(form.personal_email.trim())) {
      e.personal_email = "Invalid email format";
    }
    if (form.phone) {
      const digits = form.phone.replace(/[\s-]/g, "");
      if (digits && !PHONE_RE.test(digits)) e.phone = "Phone must be 10 digits";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = () => {
    if (!validate()) return;
    update.mutate(
      {
        employeeUuid: props.employeeUuid,
        work_name: form.work_name,
        personal_email: form.personal_email,
        phone: form.phone,
        address: form.address,
        emergency_contact: form.emergency_contact,
      },
      {
        onSuccess: () => {
          dirty.current = false;
          toast.success("Personal info saved");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to save";
          toast.error(msg);
        },
      }
    );
  };

  // Static "masked" display for when info is hidden. Looks like an Input
  // so the layout doesn't jump when you toggle.
  const MaskedField = ({ hasValue }: { hasValue: boolean }) => (
    <div
      className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground select-none"
      aria-label="Hidden — click Show to reveal"
    >
      {hasValue ? MASK : <span className="italic opacity-70">Not set</span>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">Personal Info</CardTitle>
            <CardDescription>
              {props.description ??
                "You can update contact info for agents on your team. Other fields (hire date, role, salary, ID/tax) are managed by HR."}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={showSensitive ? handleHide : handleReveal}
            className="shrink-0"
            aria-pressed={showSensitive}
          >
            {showSensitive ? (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                Hide
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Show
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showSensitive && (
          <p className="text-xs text-muted-foreground">
            Your contact info is hidden. Click <span className="font-medium">Show</span> to view or edit. Auto-hides
            after 30 seconds of inactivity.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Work Name</Label>
            {showSensitive ? (
              <Input
                value={form.work_name}
                onChange={(e) => setField("work_name", e.target.value)}
                placeholder="Preferred name"
              />
            ) : (
              <MaskedField hasValue={!!form.work_name} />
            )}
          </div>
          <div className="grid gap-2">
            <Label>Personal Email</Label>
            {showSensitive ? (
              <>
                <Input
                  type="email"
                  value={form.personal_email}
                  onChange={(e) => setField("personal_email", e.target.value)}
                  placeholder="personal@example.com"
                />
                {errors.personal_email && (
                  <p className="text-xs text-destructive">{errors.personal_email}</p>
                )}
              </>
            ) : (
              <MaskedField hasValue={!!form.personal_email} />
            )}
          </div>
          <div className="grid gap-2">
            <Label>Phone</Label>
            {showSensitive ? (
              <>
                <Input
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="33 1234 5678"
                  maxLength={15}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </>
            ) : (
              <MaskedField hasValue={!!form.phone} />
            )}
          </div>
          <div className="grid gap-2">
            <Label>Address</Label>
            {showSensitive ? (
              <Input
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                placeholder="Calle, Colonia, Ciudad, CP"
              />
            ) : (
              <MaskedField hasValue={!!form.address} />
            )}
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Emergency Contact</Label>
            {showSensitive ? (
              <Input
                value={form.emergency_contact}
                onChange={(e) => setField("emergency_contact", e.target.value)}
                placeholder="Name — Relationship — Phone"
              />
            ) : (
              <MaskedField hasValue={!!form.emergency_contact} />
            )}
          </div>
        </div>

        <Button
          onClick={onSave}
          disabled={update.isPending || !showSensitive}
          className="w-full"
          title={!showSensitive ? "Click Show to edit and save" : undefined}
        >
          <Save className="mr-2 h-4 w-4" />
          {update.isPending ? "Saving..." : "Save Personal Info"}
        </Button>
      </CardContent>
    </Card>
  );
}
