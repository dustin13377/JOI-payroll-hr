import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edge";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Trash2, UserPlus, AlertTriangle, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateMX } from "@/lib/localDate";

interface SystemUser {
  id: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  title: "owner" | "admin";
  notes: string | null;
  created_at: string;
  is_active: boolean;
}

const QUERY_KEY = ["system-users"];

export default function SystemUsers() {
  const { isOwner } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [removeUser, setRemoveUser] = useState<SystemUser | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_id, full_name, email, title, termination_notes, created_at, is_active")
        .eq("is_system_user", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        employee_id: r.employee_id,
        full_name: r.full_name,
        email: r.email,
        title: r.title as "owner" | "admin",
        notes: r.termination_notes, // we reuse this column for the "purpose" note
        created_at: r.created_at,
        is_active: r.is_active,
      })) as SystemUser[];
    },
  });

  const removeMut = useMutation({
    mutationFn: async (user: SystemUser) => {
      // Soft-deactivate: keeps the audit trail, blocks login.
      const { error } = await supabase
        .from("employees")
        .update({ employment_status: "terminated", termination_reason: "system_user_removed" })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "System user removed", description: "Their login access has been revoked." });
      setRemoveUser(null);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Removal failed";
      toast({ title: "Couldn't remove", description: msg, variant: "destructive" });
    },
  });

  // Resend the JOI invite email. Calls the existing resend-invite edge fn,
  // which knows how to handle: no auth user yet → invite; stale auth user
  // (never signed in) → wipe + re-invite; already onboarded → skip with
  // guidance to use forgot-password instead.
  const resendMut = useMutation({
    mutationFn: async (user: SystemUser) => {
      const { data, error } = await supabase.functions.invoke("resend-invite", {
        body: { employee_ids: [user.id] },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      const result = (data as { results?: Array<{ status: string; message?: string; email?: string | null }> })?.results?.[0];
      if (!result) throw new Error("No result returned from resend-invite");
      return result;
    },
    onSuccess: (result, user) => {
      if (result.status === "sent") {
        toast({
          title: "Invite resent",
          description: `New invite email sent to ${result.email ?? user.email ?? "their work email"}.`,
        });
      } else if (result.status === "skipped") {
        toast({
          title: "Already signed in",
          description: result.message ?? "Ask them to use 'Forgot password' on the sign-in page instead.",
        });
      } else {
        toast({
          title: "Resend failed",
          description: result.message ?? "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Resend failed";
      toast({ title: "Couldn't resend", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> System Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Non-employee logins (business partners, auditors, accountants). They have app access but never appear in payroll, attendance, or HR lists.
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => setShowAdd(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Add system user
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Active system users</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : users.filter((u) => u.is_active).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No system users yet. Add your business partner or any non-employee who needs login access.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Notes</TableHead>
                  {isOwner && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.filter((u) => u.is_active).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.title === "owner" ? "default" : "secondary"}>
                        {u.title === "owner" ? "Owner" : "Admin"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateMX(u.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{u.notes ?? "—"}</TableCell>
                    {isOwner && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resendMut.mutate(u)}
                            disabled={resendMut.isPending && resendMut.variables?.id === u.id}
                            title="Resend invite email"
                          >
                            <Send className="h-4 w-4 mr-1" />
                            {resendMut.isPending && resendMut.variables?.id === u.id ? "Sending…" : "Resend invite"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRemoveUser(u)} title="Remove access">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {users.some((u) => !u.is_active) && (
        <Card>
          <CardHeader><CardTitle className="text-base text-muted-foreground">Removed</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Was</TableHead>
                  <TableHead>Removed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.filter((u) => !u.is_active).map((u) => (
                  <TableRow key={u.id} className="opacity-60">
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{u.title}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateMX(u.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showAdd && <AddSystemUserDialog onClose={() => setShowAdd(false)} onSuccess={() => qc.invalidateQueries({ queryKey: QUERY_KEY })} />}
      {removeUser && (
        <ConfirmRemoveDialog
          user={removeUser}
          onCancel={() => setRemoveUser(null)}
          onConfirm={() => removeMut.mutate(removeUser)}
          isPending={removeMut.isPending}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add dialog — uses the existing create-employee edge function, then flips
// is_system_user=true in a follow-up update.
// ─────────────────────────────────────────────────────────────────────────────

function AddSystemUserDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState<"admin" | "owner">("admin");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = fullName.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Step 1: create the employee + auth user via existing function.
      const { data, error } = await supabase.functions.invoke("create-employee", {
        body: {
          email,
          full_name: fullName,
          title,
          monthly_base_salary: 0,
          daily_discount_rate: 0,
          kpi_bonus_amount: 0,
          campaign_id: null,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

      // Step 2: flip is_system_user=true and stash the notes on termination_notes
      // (reused as a free-text "purpose" field for system users).
      const newEmpId = (data as { auth_user_id?: string })?.auth_user_id;
      // Fetch the just-created employee row by email to get the employee uuid.
      const { data: emp, error: lookupErr } = await supabase
        .from("employees")
        .select("id")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (lookupErr) throw lookupErr;

      const { error: updateErr } = await supabase
        .from("employees")
        .update({
          is_system_user: true,
          termination_notes: notes || null,
        })
        .eq("id", emp.id);
      if (updateErr) throw updateErr;

      toast({
        title: "System user added",
        description: `${fullName} will receive an invite at ${email} to set up their login.`,
      });
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't add system user";
      toast({ title: "Failed to add", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add system user</DialogTitle>
          <DialogDescription>
            They'll get an invite email to set up their password. They will NOT appear on payroll, attendance, or HR lists.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="su-name">Full name</Label>
            <Input id="su-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Partner" />
          </div>
          <div>
            <Label htmlFor="su-email">Email</Label>
            <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div>
            <Label htmlFor="su-title">Access level</Label>
            <Select value={title} onValueChange={(v) => setTitle(v as "admin" | "owner")}>
              <SelectTrigger id="su-title"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — full HR + leadership access</SelectItem>
                <SelectItem value="owner">Owner — full access including provisioning</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Only Admin or Owner allowed for system users — other roles need team/campaign assignments.
            </p>
          </div>
          <div>
            <Label htmlFor="su-notes">Purpose / notes (optional)</Label>
            <Textarea id="su-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Business partner, accounting access, etc." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Adding…" : "Add and send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmRemoveDialog({
  user,
  onCancel,
  onConfirm,
  isPending,
}: {
  user: SystemUser;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [confirmName, setConfirmName] = useState("");
  const matches = confirmName.trim().toLowerCase() === user.full_name.trim().toLowerCase();

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove system user — {user.full_name}</DialogTitle>
          <DialogDescription>
            This revokes their login access and marks the account as removed. Audit trail is preserved.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Type the user's full name to confirm: <strong>{user.full_name}</strong>
          </AlertDescription>
        </Alert>

        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={user.full_name} />

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!matches || isPending}>
            {isPending ? "Removing…" : "Remove access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
