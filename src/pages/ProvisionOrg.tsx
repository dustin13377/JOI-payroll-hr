import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2 } from "lucide-react";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-");
}

function toPrefix(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

type FormState = {
  orgName: string;
  orgSlug: string;
  employeeIdPrefix: string;
  ownerEmail: string;
  ownerFullName: string;
};

type FieldError = Partial<Record<keyof FormState, string>> & { general?: string };

export default function ProvisionOrg() {
  const [form, setForm] = useState<FormState>({
    orgName: "",
    orgSlug: "",
    employeeIdPrefix: "",
    ownerEmail: "",
    ownerFullName: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ orgName: string; email: string } | null>(null);

  const handleOrgNameChange = (value: string) => {
    setForm((f) => ({
      ...f,
      orgName: value,
      orgSlug: slugTouched ? f.orgSlug : toSlug(value),
      employeeIdPrefix: prefixTouched ? f.employeeIdPrefix : toPrefix(value),
    }));
    setErrors((e) => ({ ...e, orgName: undefined }));
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    setForm((f) => ({ ...f, orgSlug: toSlug(value) }));
    setErrors((e) => ({ ...e, orgSlug: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldError = {};
    if (!form.orgName.trim()) next.orgName = "Organization name is required";
    if (!form.orgSlug.trim()) {
      next.orgSlug = "Slug is required";
    } else if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$|^[a-z0-9]{3,50}$/.test(form.orgSlug)) {
      next.orgSlug = "Slug must be 3–50 chars: lowercase letters, numbers, and hyphens only";
    }
    if (!form.employeeIdPrefix.trim()) {
      next.employeeIdPrefix = "Employee ID prefix is required";
    } else if (!/^[A-Z0-9]{2,10}$/.test(form.employeeIdPrefix)) {
      next.employeeIdPrefix = "Must be 2–10 uppercase letters and numbers only";
    }
    if (!form.ownerEmail.trim()) {
      next.ownerEmail = "Owner email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)) {
      next.ownerEmail = "Enter a valid email address";
    }
    if (!form.ownerFullName.trim()) next.ownerFullName = "Owner full name is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setErrors({});

    try {
      const { data, error } = await supabase.functions.invoke("provision-org", {
        body: {
          orgName: form.orgName.trim(),
          orgSlug: form.orgSlug.trim(),
          employeeIdPrefix: form.employeeIdPrefix.trim(),
          ownerEmail: form.ownerEmail.trim(),
          ownerFullName: form.ownerFullName.trim(),
        },
      });

      if (error) {
        setErrors({ general: await edgeErrorMessage(error) });
        return;
      }

      if (data?.error === "slug_taken") {
        setErrors({ orgSlug: "That slug is already in use" });
        return;
      }

      if (data?.error === "email_taken") {
        setErrors({ ownerEmail: "That email is already registered" });
        return;
      }

      if (data?.error) {
        setErrors({ general: "Something went wrong, please try again." });
        return;
      }

      setSuccess({ orgName: form.orgName.trim(), email: form.ownerEmail.trim() });
    } catch {
      setErrors({ general: "Something went wrong, please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <Card className="border-0 shadow-md">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#1B2A4A]/10">
              <CheckCircle2 className="w-7 h-7 text-[#1B2A4A]" />
            </div>
            <h2 className="text-xl font-bold text-[#1B2A4A]">Organization created</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Invite sent to <span className="font-semibold text-foreground">{success.email}</span>.
              They'll receive a magic link to set up their account for{" "}
              <span className="font-semibold text-foreground">{success.orgName}</span>.
            </p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                setSuccess(null);
                setForm({ orgName: "", orgSlug: "", employeeIdPrefix: "", ownerEmail: "", ownerFullName: "" });
                setSlugTouched(false);
                setPrefixTouched(false);
              }}
            >
              Provision another org
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#1B2A4A]">
          <Building2 className="w-5 h-5 text-[#FFA700]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Provision New Org</h1>
          <p className="text-sm text-muted-foreground">
            Creates a new tenant and sends an owner invite.
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-[#1B2A4A]">Organization details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-5">
            {/* Org name */}
            <div className="grid gap-1.5">
              <Label htmlFor="orgName">Organization name</Label>
              <Input
                id="orgName"
                value={form.orgName}
                onChange={(e) => handleOrgNameChange(e.target.value)}
                placeholder="Acme Corp"
                aria-invalid={!!errors.orgName}
              />
              {errors.orgName && (
                <p className="text-xs text-destructive">{errors.orgName}</p>
              )}
            </div>

            {/* Slug */}
            <div className="grid gap-1.5">
              <Label htmlFor="orgSlug">Slug</Label>
              <Input
                id="orgSlug"
                value={form.orgSlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="acme"
                aria-invalid={!!errors.orgSlug}
              />
              {errors.orgSlug ? (
                <p className="text-xs text-destructive">{errors.orgSlug}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Used in URLs and internal IDs. Cannot be changed later.
                </p>
              )}
            </div>

            {/* Employee ID Prefix */}
            <div className="grid gap-1.5">
              <Label htmlFor="employeeIdPrefix">Employee ID Prefix</Label>
              <Input
                id="employeeIdPrefix"
                value={form.employeeIdPrefix}
                onChange={(e) => {
                  setPrefixTouched(true);
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
                  setForm((f) => ({ ...f, employeeIdPrefix: val }));
                  setErrors((er) => ({ ...er, employeeIdPrefix: undefined }));
                }}
                placeholder="ACME"
                maxLength={10}
                aria-invalid={!!errors.employeeIdPrefix}
              />
              {errors.employeeIdPrefix ? (
                <p className="text-xs text-destructive">{errors.employeeIdPrefix}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  2–10 uppercase letters/numbers. New employees in this org will get IDs like{" "}
                  <span className="font-medium">{form.employeeIdPrefix || "ACME"}-0001</span>.
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-[#1B2A4A] mb-4">Owner account</p>

              {/* Owner full name */}
              <div className="grid gap-1.5 mb-4">
                <Label htmlFor="ownerFullName">Full name</Label>
                <Input
                  id="ownerFullName"
                  value={form.ownerFullName}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, ownerFullName: e.target.value }));
                    setErrors((er) => ({ ...er, ownerFullName: undefined }));
                  }}
                  placeholder="John Smith"
                  aria-invalid={!!errors.ownerFullName}
                />
                {errors.ownerFullName && (
                  <p className="text-xs text-destructive">{errors.ownerFullName}</p>
                )}
              </div>

              {/* Owner email */}
              <div className="grid gap-1.5">
                <Label htmlFor="ownerEmail">Email</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, ownerEmail: e.target.value }));
                    setErrors((er) => ({ ...er, ownerEmail: undefined }));
                  }}
                  placeholder="admin@acme.com"
                  aria-invalid={!!errors.ownerEmail}
                />
                {errors.ownerEmail && (
                  <p className="text-xs text-destructive">{errors.ownerEmail}</p>
                )}
              </div>
            </div>

            {errors.general && (
              <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                {errors.general}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="bg-[#1B2A4A] hover:bg-[#1B2A4A]/90 text-white font-semibold"
            >
              {submitting ? "Creating…" : "Create org & send invite"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
