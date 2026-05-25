/**
 * /admin/payroll/client-holidays — Per-client holiday calendar
 *
 * Lets leadership add days when a client is closed (e.g. US holidays like
 * Memorial Day, Thanksgiving) so agents on that client's campaigns aren't
 * marked as missed and don't get a missed-day payroll deduction.
 *
 * These are NOT statutory LFT holidays and do NOT trigger holiday premium
 * pay if an agent does work that day — they just suppress the absence.
 *
 * For LFT Mexican holidays see /admin/payroll/holidays.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateMX } from "@/lib/localDate";

type Client = { id: string; name: string };
type ClientHoliday = {
  id: string;
  client_id: string;
  date: string;
  name: string;
  client: { name: string } | null;
};

export default function ClientHolidays() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [clientFilter, setClientFilter] = useState<string>("__all__");
  const [addOpen, setAddOpen] = useState(false);

  // Clients list (for filter + add dialog)
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Year range
  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ["client-holidays", year],
    queryFn: async (): Promise<ClientHoliday[]> => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await supabase
        .from("client_holidays")
        .select("id, client_id, date, name, client:clients(name)")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as ClientHoliday[];
    },
  });

  const filtered = useMemo(() => {
    if (clientFilter === "__all__") return holidays;
    return holidays.filter((h) => h.client_id === clientFilter);
  }, [holidays, clientFilter]);

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday removed");
      queryClient.invalidateQueries({ queryKey: ["client-holidays"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="p-6 max-w-5xl space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link to="/admin/payroll" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />
            Payroll
          </Link>
          <span>/</span>
          <span>Client Holidays</span>
        </div>
        <h1 className="text-2xl font-bold">Client Holidays</h1>
        <p className="text-muted-foreground text-sm">
          Days when a client is closed (e.g. US holidays like Memorial Day, Thanksgiving). Agents
          on that client's campaigns won't be marked missed on these days. No premium pay applies —
          for LFT Mexican holidays see{" "}
          <Link to="/admin/payroll/holidays" className="underline">
            Mexican Holidays
          </Link>
          .
        </p>
      </div>

      {/* Filters + Add */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <Label className="text-xs">Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Client</Label>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length}</span> shown
            </span>
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add holiday
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">
              No client holidays for {year}
              {clientFilter !== "__all__" ? " on this client" : ""}.
            </p>
            <Button onClick={() => setAddOpen(true)} size="sm" variant="outline" className="mt-4">
              <Plus className="h-4 w-4 mr-1" /> Add the first one
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Date</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h.id} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="p-3">
                      <div className="font-medium">{formatDateMX(h.date)}</div>
                      <div className="text-xs text-muted-foreground">{h.date}</div>
                    </td>
                    <td className="p-3">{h.name}</td>
                    <td className="p-3 text-muted-foreground">{h.client?.name ?? "—"}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remove "${h.name}" on ${h.date}?`)) {
                            deleteMutation.mutate(h.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <AddHolidayDialog open={addOpen} onOpenChange={setAddOpen} clients={clients} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add dialog                                                          */
/* ------------------------------------------------------------------ */

function AddHolidayDialog({
  open,
  onOpenChange,
  clients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
}) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [name, setName] = useState<string>("");

  const addMutation = useMutation({
    mutationFn: async () => {
      // Need organization_id — pull from the chosen client
      const { data: client, error: cErr } = await supabase
        .from("clients")
        .select("organization_id")
        .eq("id", clientId)
        .single();
      if (cErr) throw cErr;

      const { error } = await supabase.from("client_holidays").insert({
        client_id: clientId,
        date,
        name: name.trim(),
        organization_id: client.organization_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday added");
      queryClient.invalidateQueries({ queryKey: ["client-holidays"] });
      setClientId("");
      setDate("");
      setName("");
      onOpenChange(false);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const canSubmit = clientId && date && name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add client holiday</DialogTitle>
          <DialogDescription>
            Agents on this client's campaigns won't be marked as missed on this day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Memorial Day (US), Thanksgiving, July 4th"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={addMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => addMutation.mutate()} disabled={!canSubmit || addMutation.isPending}>
            {addMutation.isPending ? "Saving…" : "Add holiday"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
