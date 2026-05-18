import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useUpdateEmployeePersonalInfo } from "@/hooks/useSupabasePayroll";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Personal Info</CardTitle>
        <CardDescription>
          {props.description ??
            "You can update contact info for agents on your team. Other fields (hire date, role, salary, ID/tax) are managed by HR."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Work Name</Label>
            <Input
              value={form.work_name}
              onChange={(e) => setField("work_name", e.target.value)}
              placeholder="Preferred name"
            />
          </div>
          <div className="grid gap-2">
            <Label>Personal Email</Label>
            <Input
              type="email"
              value={form.personal_email}
              onChange={(e) => setField("personal_email", e.target.value)}
              placeholder="personal@example.com"
            />
            {errors.personal_email && (
              <p className="text-xs text-destructive">{errors.personal_email}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="33 1234 5678"
              maxLength={15}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
          <div className="grid gap-2">
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              placeholder="Calle, Colonia, Ciudad, CP"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Emergency Contact</Label>
            <Input
              value={form.emergency_contact}
              onChange={(e) => setField("emergency_contact", e.target.value)}
              placeholder="Name — Relationship — Phone"
            />
          </div>
        </div>

        <Button onClick={onSave} disabled={update.isPending} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {update.isPending ? "Saving..." : "Save Personal Info"}
        </Button>
      </CardContent>
    </Card>
  );
}
