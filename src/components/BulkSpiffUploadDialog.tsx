/**
 * @deprecated No longer used. Spiffs are now entered via /spiffs (TL entry)
 * and attached to invoices automatically via attach_pending_spiffs().
 * The import-spiffs edge function this called is also retired (still deployed
 * but no longer invoked). Delete this file in a follow-up cleanup.
 */

/**
 * Bulk spiff CSV upload — accepts one or many CSV files, parses each, fuzzy-matches
 * agent names against every line on every active (draft + sent) invoice, and applies
 * the spiff amount to the matching line's `spiffs` field.
 *
 * Does NOT touch payroll. For that, the Dashboard's separate "Upload Spiffs" button
 * still exists (writes to payroll_records.additional_bonuses).
 *
 * Workflow:
 *   1. D drops in N CSVs (one per client) at the start of the week.
 *   2. Each row is shown in a preview, grouped by file, with the matched invoice line.
 *   3. D can override any mismatched row via dropdown.
 *   4. Confirm → all spiffs applied in parallel, query cache invalidated.
 */

import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lastCompletedWeek, parseLocalDate, todayLocal, getWeekRange } from "@/lib/localDate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet, X, CalendarPlus, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { fmtUSD } from "@/hooks/useInvoices";

/* ----- types ----- */

interface ParsedRow {
  fileKey: string;       // identifies which file this came from
  fileName: string;
  raw: string;
  name: string;
  amount: number;
  date: string | null;       // YYYY-MM-DD if a DATE column was detected
  clientHint: string | null; // CLIENT column if present, used for client-scoping
  alreadyInvoiced: boolean;  // INVOICED TO CLIENT = YES (filtered out)
  outOfRange: boolean;       // DATE not in chosen week (filtered out)
}

interface CandidateLine {
  line_id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_status: string;
  client_name: string;
  // Alternate names this client is known by in CSV uploads. See aliases column
  // on clients table (add_clients_aliases migration). Lets a sheet column
  // reading "HFB" match a DB client named "HFB Tech".
  client_aliases: string[];
  agent_name: string;
}

interface Match {
  row: ParsedRow;
  lineId: string | null;     // best line, or null if unmatched
  score: number;
}

/* ----- parsers + match helpers (shared logic with SpiffPasteDialog) ----- */

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

/** Parse "5/18/26" or "05/18/26" or "5/18/2026" → "YYYY-MM-DD". Returns null on failure. */
function parseLooseDate(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  // ISO YYYY-MM-DD first
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  // M/D/YY or MM/DD/YY or M/D/YYYY
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slash) {
    let yr = parseInt(slash[3], 10);
    if (slash[3].length === 2) yr = yr < 50 ? 2000 + yr : 1900 + yr;
    return `${yr}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  return null;
}

/** Split a CSV line, respecting quoted fields. Handles "$2,000.00" without splitting on the inner comma. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Detect the SPIFFS TRACKER schema by header row. Returns column indices if matched. */
function detectSpiffsTrackerSchema(headerCells: string[]): { date: number; agent: number; charge: number; client: number; invoiced: number } | null {
  const norm = headerCells.map((c) => c.toLowerCase().trim());
  const date = norm.findIndex((c) => c === "date");
  const agent = norm.findIndex((c) => c === "agent" || c.startsWith("agent "));
  const charge = norm.findIndex((c) => c.includes("charge") && c.includes("client"));
  const client = norm.findIndex((c) => c === "client");
  const invoiced = norm.findIndex((c) => c.includes("invoiced"));
  if (date >= 0 && agent >= 0 && charge >= 0) {
    return { date, agent, charge, client, invoiced };
  }
  return null;
}

function parseCsvText(text: string, fileName: string, fileKey: string, weekStart: string, weekEnd: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return out;

  // Try to detect SPIFFS TRACKER schema from the first non-empty row.
  const firstNonEmpty = lines.find((l) => l.trim() !== "");
  const headerCells = firstNonEmpty ? splitCsvLine(firstNonEmpty) : [];
  const schema = detectSpiffsTrackerSchema(headerCells);

  if (schema) {
    // Structured parse.
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      const cells = splitCsvLine(lines[i]);
      const dateStr = cells[schema.date] ?? "";
      const agent = cells[schema.agent] ?? "";
      const chargeStr = cells[schema.charge] ?? "";
      const clientHint = schema.client >= 0 ? (cells[schema.client] ?? "") : "";
      const invoicedFlag = schema.invoiced >= 0 ? (cells[schema.invoiced] ?? "").toLowerCase() : "";

      if (!agent || !chargeStr) continue;
      const amount = Number(chargeStr.replace(/["$,\s]/g, ""));
      if (Number.isNaN(amount) || amount === 0) continue;

      const isoDate = parseLooseDate(dateStr);
      const outOfRange = !!isoDate && (isoDate < weekStart || isoDate > weekEnd);
      const alreadyInvoiced = invoicedFlag === "yes" || invoicedFlag === "y";

      out.push({
        fileKey, fileName, raw,
        name: agent,
        amount,
        date: isoDate,
        clientHint: clientHint || null,
        alreadyInvoiced,
        outOfRange,
      });
    }
    return out;
  }

  // Fallback: simple "name, amount" pairs — uses right-to-left numeric finder.
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let parts: string[];
    if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(";")) parts = line.split(";");
    else if (line.includes(",")) parts = splitCsvLine(line);
    else parts = line.split(/\s{2,}/);
    if (parts.length < 2) continue;
    let amount = NaN;
    let name = "";
    for (let i = parts.length - 1; i >= 0; i--) {
      const cleaned = parts[i].replace(/["$,\s]/g, "");
      const num = Number(cleaned);
      if (!Number.isNaN(num) && cleaned !== "") {
        amount = num;
        name = parts.slice(0, i).join(" ").trim().replace(/^["']|["']$/g, "");
        break;
      }
    }
    if (!name || Number.isNaN(amount) || amount === 0) continue;
    out.push({
      fileKey, fileName, raw: line,
      name, amount,
      date: null,
      clientHint: null,
      alreadyInvoiced: false,
      outOfRange: false,
    });
  }
  return out;
}

function scoreMatch(pastedName: string, lineName: string): number {
  const a = tokenize(pastedName);
  const b = tokenize(lineName);
  if (a.length === 0 || b.length === 0) return 0;
  if (normalize(pastedName) === normalize(lineName)) return 100;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let shared = 0;
  for (const t of aSet) if (bSet.has(t)) shared += 1;
  if (shared === 0) {
    if (normalize(lineName).includes(normalize(pastedName))) return 30;
    if (normalize(pastedName).includes(normalize(lineName))) return 25;
    return 0;
  }
  const firstMatches = a[0] === b[0];
  const lastMatches = a[a.length - 1] === b[b.length - 1];
  let score = shared * 20;
  if (firstMatches) score += 15;
  if (lastMatches) score += 25;
  for (const t of a) {
    if (t.length < 3) continue;
    if (b.some((x) => x.startsWith(t) || t.startsWith(x))) score += 5;
  }
  return Math.min(score, 95);
}

/**
 * Match each row to the best invoice line, respecting:
 *  - Skip rows already filtered (out of range, optionally already invoiced).
 *  - Constrain candidates by clientHint (a Torro row only matches Torro lines).
 *  - Multiple rows for the same agent within the week are allowed — they don't
 *    "claim" the same line so they aggregate later instead of fighting.
 */
function matchAll(rows: ParsedRow[], candidates: CandidateLine[], skipAlreadyInvoiced: boolean): Match[] {
  const result: Match[] = [];
  for (const r of rows) {
    if (r.outOfRange || (skipAlreadyInvoiced && r.alreadyInvoiced)) {
      result.push({ row: r, lineId: null, score: 0 });
      continue;
    }
    // clientHint matches either the canonical client_name or any declared alias
    // (normalized). Aliases live on clients.aliases — see add_clients_aliases
    // migration.
    const eligible = r.clientHint
      ? candidates.filter((c) => {
          const hint = normalize(r.clientHint!);
          if (normalize(c.client_name) === hint) return true;
          return c.client_aliases.some((a) => normalize(a) === hint);
        })
      : candidates;
    let best: { lineId: string; score: number } | null = null;
    for (const c of eligible) {
      const s = scoreMatch(r.name, c.agent_name);
      if (s > 0 && (!best || s > best.score)) {
        best = { lineId: c.line_id, score: s };
      }
    }
    if (best && best.score >= 30) {
      result.push({ row: r, lineId: best.lineId, score: best.score });
    } else {
      result.push({ row: r, lineId: null, score: 0 });
    }
  }
  return result;
}

/* ----- candidate-line query ----- */

function useCandidateLines(weekStart: string | null, weekEnd: string | null) {
  return useQuery({
    queryKey: ["spiff-target-lines", weekStart, weekEnd],
    enabled: !!weekStart && !!weekEnd,
    queryFn: async (): Promise<CandidateLine[]> => {
      const { data: invs, error: invErr } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, week_start, week_end, clients(name, aliases)")
        .in("status", ["draft", "sent"])
        .eq("week_start", weekStart!)
        .eq("week_end", weekEnd!);
      if (invErr) throw invErr;
      const invIds = (invs || []).map((i: any) => i.id);
      if (invIds.length === 0) return [];
      const { data: lines, error: linesErr } = await supabase
        .from("invoice_lines")
        .select("id, invoice_id, agent_name")
        .in("invoice_id", invIds);
      if (linesErr) throw linesErr;
      const invById = new Map<string, any>();
      for (const inv of invs || []) invById.set(inv.id, inv);
      return (lines || []).map((l: any) => {
        const inv = invById.get(l.invoice_id);
        return {
          line_id: l.id,
          invoice_id: l.invoice_id,
          invoice_number: inv?.invoice_number ?? "?",
          invoice_status: inv?.status ?? "?",
          client_name: inv?.clients?.name ?? "?",
          client_aliases: (inv?.clients?.aliases ?? []) as string[],
          agent_name: l.agent_name,
        };
      });
    },
  });
}

/* ----- main dialog ----- */

export function BulkSpiffUploadDialog() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Array<{ key: string; name: string; text: string }>>([]);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({}); // rowKey → lineId | null
  const [applying, setApplying] = useState(false);

  // Week scope: defaults to the same "last completed week" used by Generate Week.
  // Spiffs only apply to invoices for THIS week — protects against accidentally
  // landing old spiff CSV rows on the current invoices.
  const initialWeek = lastCompletedWeek();
  const [monday, setMonday] = useState<string>(initialWeek.monday);
  const sunday = useMemo(() => {
    const m = parseLocalDate(monday);
    const s = new Date(m);
    s.setDate(m.getDate() + 6);
    return todayLocal(s);
  }, [monday]);

  function onPickDate(d: string) {
    if (!d) return;
    setMonday(getWeekRange(d).monday);
  }

  // Default OFF: during the migration round, D's master sheet has YES on rows
  // that were billed under the OLD system but haven't been applied to the new
  // invoices yet. We want those to land. He can flip this ON once the new flow
  // is the source of truth.
  const [skipAlreadyInvoiced, setSkipAlreadyInvoiced] = useState(false);

  const { data: candidates = [] } = useCandidateLines(monday, sunday);
  const qc = useQueryClient();

  const allRows: ParsedRow[] = useMemo(() => {
    return files.flatMap((f) => parseCsvText(f.text, f.name, f.key, monday, sunday));
  }, [files, monday, sunday]);

  const matches = useMemo(
    () => matchAll(allRows, candidates, skipAlreadyInvoiced),
    [allRows, candidates, skipAlreadyInvoiced],
  );

  // Categorize each row into exactly ONE bucket so the summary numbers sum to the row count.
  // Priority: matched > unmatched-in-week > skipped-already-invoiced > skipped-outside-week
  const bucketed = useMemo(() => {
    let matched = 0, unmatched = 0, skippedInvoiced = 0, skippedOutOfWeek = 0;
    for (const m of matches) {
      if (m.lineId) { matched++; continue; }
      if (m.row.outOfRange) { skippedOutOfWeek++; continue; }
      if (skipAlreadyInvoiced && m.row.alreadyInvoiced) { skippedInvoiced++; continue; }
      unmatched++;
    }
    return { matched, unmatched, skippedInvoiced, skippedOutOfWeek };
  }, [matches, skipAlreadyInvoiced]);

  function rowKey(r: ParsedRow): string {
    return `${r.fileKey}::${r.raw}`;
  }
  function effectiveLineId(m: Match): string | null {
    const o = overrides[rowKey(m.row)];
    if (o === undefined) return m.lineId;
    return o;
  }

  const finalAssignmentsRaw = matches.map((m) => ({ m, lineId: effectiveLineId(m) }));
  const matchedCount = finalAssignmentsRaw.filter((f) => f.lineId).length;
  const totalAmount = finalAssignmentsRaw
    .filter((f) => f.lineId)
    .reduce((s, f) => s + f.m.row.amount, 0);

  // Sort for the preview: matched first, then unmatched-in-week, then skipped.
  // Within each group, sort by date asc, then agent.
  const finalAssignments = [...finalAssignmentsRaw].sort((a, b) => {
    const order = (f: typeof a) => {
      if (f.lineId) return 0;
      if (f.m.row.outOfRange) return 3;
      if (skipAlreadyInvoiced && f.m.row.alreadyInvoiced) return 2;
      return 1; // unmatched in-window
    };
    const oa = order(a), ob = order(b);
    if (oa !== ob) return oa - ob;
    const da = a.m.row.date ?? "9999";
    const db = b.m.row.date ?? "9999";
    if (da !== db) return da.localeCompare(db);
    return a.m.row.name.localeCompare(b.m.row.name);
  });

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const reads = Array.from(fileList).map((f, idx) => new Promise<{ key: string; name: string; text: string }>((resolve, reject) => {
      const r = new FileReader();
      r.onload = (e) => resolve({ key: `${Date.now()}-${idx}-${f.name}`, name: f.name, text: (e.target?.result as string) || "" });
      r.onerror = () => reject(r.error);
      r.readAsText(f);
    }));
    const loaded = await Promise.all(reads);
    setFiles((prev) => [...prev, ...loaded]);
  }

  function removeFile(key: string) {
    setFiles((prev) => prev.filter((f) => f.key !== key));
  }

  async function handleApply() {
    if (matchedCount === 0) {
      toast.error("No matched rows to apply.");
      return;
    }
    setApplying(true);
    try {
      // Aggregate by lineId (in case a line is hit by multiple rows across files)
      const byLine = new Map<string, number>();
      for (const f of finalAssignments) {
        if (!f.lineId) continue;
        byLine.set(f.lineId, (byLine.get(f.lineId) ?? 0) + f.m.row.amount);
      }

      // Fetch current line data so we can recompute total_price (since spiffs feed into it)
      const lineIds = Array.from(byLine.keys());
      const { data: lines, error: fetchErr } = await supabase
        .from("invoice_lines")
        .select("id, days_worked, holiday_days, unit_price, is_flat_total, total_price")
        .in("id", lineIds);
      if (fetchErr) throw fetchErr;

      // Apply each update
      for (const line of lines || []) {
        const spiffs = byLine.get(line.id) ?? 0;
        const days = Number(line.days_worked);
        const holiday = Number(line.holiday_days);
        const unit = Number(line.unit_price);
        // `days` already includes holiday days; holiday adds 2× premium on top.
        const total = (days * unit) + (holiday * unit * 2);
        const total_price = line.is_flat_total
          ? Number(line.total_price)
          : total + spiffs;
        const { error } = await supabase
          .from("invoice_lines")
          .update({ spiffs, total, total_price })
          .eq("id", line.id);
        if (error) throw error;
      }
      toast.success(`Applied spiffs to ${byLine.size} line${byLine.size === 1 ? "" : "s"} (${fmtUSD(totalAmount)} total).`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
      qc.invalidateQueries({ queryKey: ["spiff-target-lines"] });
      setOpen(false);
      setFiles([]);
      setOverrides({});
    } catch (e: any) {
      toast.error(e?.message ?? "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFiles([]); setOverrides({}); } }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Upload Spiffs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Upload spiff CSVs</DialogTitle>
          <DialogDescription>
            Drop in one CSV per client. We'll match agent names against draft & sent invoices and apply the spiff to the matching line. Headers are auto-skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Empty-state banner — when no invoices exist for the chosen week, this is what blocks the flow. */}
          {candidates.length === 0 && (
            <div className="flex items-start gap-3 p-4 rounded-md border-2 border-amber-300 bg-amber-50">
              <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-900">
                  No invoices exist for this week yet
                </p>
                <p className="text-xs text-amber-800">
                  Spiffs need invoice lines to land on. Click "Generate Week" first to create the drafts for the picked week, then come back here and upload the CSV.
                </p>
                <Button asChild size="sm" variant="default">
                  <Link to="/facturas/nueva">
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Go to Generate Week
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Week picker + filters */}
          <div className="flex flex-wrap items-end gap-3 p-3 rounded-md bg-muted/30 border">
            <div>
              <Label className="text-xs text-muted-foreground">Invoice week (Monday)</Label>
              <Input
                type="date"
                value={monday}
                onChange={(e) => onPickDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="text-xs text-muted-foreground pb-2">
              Sunday: {sunday}
              <br />
              {candidates.length === 0
                ? <span className="text-amber-700">No draft/sent invoices for this week</span>
                : <span>{candidates.length} agent line{candidates.length === 1 ? "" : "s"} available to match</span>
              }
            </div>
            <div className="flex items-center gap-2 pb-1 ml-auto">
              <Checkbox
                id="skip-invoiced"
                checked={skipAlreadyInvoiced}
                onCheckedChange={(v) => setSkipAlreadyInvoiced(!!v)}
              />
              <Label htmlFor="skip-invoiced" className="text-xs cursor-pointer">
                Skip rows where INVOICED TO CLIENT = YES
              </Label>
            </div>
          </div>

          {/* File picker */}
          <label className="flex items-center justify-center gap-3 border-2 border-dashed border-muted rounded-lg p-6 cursor-pointer hover:bg-muted/40 transition-colors">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-medium text-primary">Click to add CSVs</span>
              <span className="text-muted-foreground"> · or drop them here · multiple files OK</span>
            </span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.currentTarget.files)}
            />
          </label>

          {/* File list */}
          {files.length > 0 && (
            <div className="border rounded-md p-2 space-y-1">
              {files.map((f) => (
                <div key={f.key} className="flex items-center justify-between text-sm py-1 px-2 hover:bg-muted/40 rounded">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span>{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {allRows.filter((r) => r.fileKey === f.key).length} row{allRows.filter((r) => r.fileKey === f.key).length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <button type="button" onClick={() => removeFile(f.key)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Match preview */}
          {allRows.length > 0 && (
            <div className="border rounded-md">
              <div className="px-3 py-2 bg-muted/40 flex items-center justify-between text-xs flex-wrap gap-2">
                <span>{allRows.length} row{allRows.length === 1 ? "" : "s"} loaded</span>
                <div className="flex gap-4 flex-wrap">
                  <span className="text-green-700">
                    <CheckCircle2 className="h-3 w-3 inline-block mr-1" /> {bucketed.matched} matched
                  </span>
                  {bucketed.unmatched > 0 && (
                    <span className="text-amber-700">
                      <AlertTriangle className="h-3 w-3 inline-block mr-1" /> {bucketed.unmatched} unmatched
                    </span>
                  )}
                  {bucketed.skippedOutOfWeek > 0 && (
                    <span className="text-muted-foreground">
                      {bucketed.skippedOutOfWeek} outside week
                    </span>
                  )}
                  {bucketed.skippedInvoiced > 0 && (
                    <span className="text-muted-foreground">
                      {bucketed.skippedInvoiced} already invoiced
                    </span>
                  )}
                  <span className="font-medium">{fmtUSD(totalAmount)} to apply</span>
                </div>
              </div>
              <ScrollArea className="max-h-80">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 sticky top-0">
                    <tr>
                      <th className="text-left p-2 w-20">Date</th>
                      <th className="text-left p-2">Agent</th>
                      <th className="text-left p-2 w-20">Client</th>
                      <th className="text-right p-2 w-20">Amount</th>
                      <th className="text-left p-2">Match (invoice · agent)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalAssignments.map((f, i) => {
                      const candidate = candidates.find((c) => c.line_id === f.lineId);
                      const isOutOfWeek = f.m.row.outOfRange;
                      const isSkippedInvoiced = skipAlreadyInvoiced && f.m.row.alreadyInvoiced;
                      const isSkipped = isOutOfWeek || isSkippedInvoiced;
                      let rowBg = "";
                      if (isSkipped) rowBg = "bg-muted/30 text-muted-foreground";
                      else if (!f.lineId) rowBg = "bg-amber-50/40";
                      return (
                        <tr key={i} className={`border-t ${rowBg}`}>
                          <td className="p-2 font-mono">{f.m.row.date ?? "—"}</td>
                          <td className="p-2">{f.m.row.name}</td>
                          <td className="p-2 text-muted-foreground">{f.m.row.clientHint ?? "—"}</td>
                          <td className="p-2 text-right font-mono">{fmtUSD(f.m.row.amount)}</td>
                          <td className="p-2">
                            {isOutOfWeek ? (
                              <span className="text-muted-foreground">Outside picked week · skipped</span>
                            ) : isSkippedInvoiced ? (
                              <span className="text-muted-foreground">Already invoiced · skipped</span>
                            ) : (
                              <>
                                <Select
                                  value={f.lineId ?? "__none__"}
                                  onValueChange={(v) =>
                                    setOverrides((prev) => ({
                                      ...prev,
                                      [rowKey(f.m.row)]: v === "__none__" ? null : v,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Skip" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">Skip this row</SelectItem>
                                    {candidates
                                      .slice()
                                      .sort((a, b) => a.invoice_number.localeCompare(b.invoice_number) || a.agent_name.localeCompare(b.agent_name))
                                      .map((c) => (
                                        <SelectItem key={c.line_id} value={c.line_id}>
                                          [{c.invoice_number}] {c.agent_name}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                                {candidate && f.m.score > 0 && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    auto-matched · {f.m.score}% · {candidate.invoice_number}
                                  </p>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          {files.length > 0 && allRows.length === 0 && (
            <p className="text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3 inline-block mr-1" />
              The files loaded but no rows parsed. Each row needs a name and a numeric amount.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleApply} disabled={applying || matchedCount === 0}>
            {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Apply {matchedCount > 0 ? `to ${matchedCount} line${matchedCount === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
