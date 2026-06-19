/**
 * @deprecated No longer used. See BulkSpiffUploadDialog for context.
 * Delete this file in a follow-up cleanup.
 */

/**
 * Preview-mode spiff upload. Used on /facturas/nueva BEFORE invoices are
 * generated. CSV rows match against the in-memory preview lines (one row per
 * employee per client) and feed back into the parent's staged-spiffs Map.
 * No DB writes here — that happens when the user clicks "Generate all drafts."
 *
 * Sister component to BulkSpiffUploadDialog (which does DB writes against
 * existing invoices). They share the CSV parser + fuzzy matcher.
 */

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD, type ClientPreview, type WeeklyPreviewRow } from "@/hooks/useInvoices";

/* ----- types ----- */

interface ParsedRow {
  fileKey: string;
  fileName: string;
  raw: string;
  name: string;
  amount: number;
  date: string | null;
  clientHint: string | null;
  // INVOICED TO CLIENT column. Filter rule:
  //   "no"    → eligible to apply
  //   "yes"   → skip (already billed)
  //   "blank" → skip (not yet marked ready)
  invoicedStatus: "yes" | "no" | "blank";
}

interface Candidate {
  employee_id: string;
  agent_name: string;
  client_id: string;
  client_name: string;
  // Alternate names this client is known by in CSV uploads. The spiff tracker
  // sheet uses short labels like "HFB" while clients.name is "HFB Tech" —
  // aliases let the importer match either without renaming the canonical name.
  client_aliases: string[];
}

interface Match {
  row: ParsedRow;
  employeeId: string | null;
  score: number;
}

/* ----- helpers (mirror BulkSpiffUploadDialog) ----- */

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
function parseLooseDate(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slash) {
    let yr = parseInt(slash[3], 10);
    if (slash[3].length === 2) yr = yr < 50 ? 2000 + yr : 1900 + yr;
    return `${yr}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  return null;
}
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === "," && !inQuote) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
function detectSpiffsTrackerSchema(headerCells: string[]) {
  const norm = headerCells.map((c) => c.toLowerCase().trim());
  const date = norm.findIndex((c) => c === "date");
  const agent = norm.findIndex((c) => c === "agent" || c.startsWith("agent "));
  const charge = norm.findIndex((c) => c.includes("charge") && c.includes("client"));
  const client = norm.findIndex((c) => c === "client");
  const invoiced = norm.findIndex((c) => c.includes("invoiced"));
  if (date >= 0 && agent >= 0 && charge >= 0) return { date, agent, charge, client, invoiced };
  return null;
}
function parseCsvText(text: string, fileName: string, fileKey: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return out;
  const firstNonEmpty = lines.find((l) => l.trim() !== "");
  const headerCells = firstNonEmpty ? splitCsvLine(firstNonEmpty) : [];
  const schema = detectSpiffsTrackerSchema(headerCells);
  if (schema) {
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      const cells = splitCsvLine(lines[i]);
      const dateStr = cells[schema.date] ?? "";
      const agent = cells[schema.agent] ?? "";
      const chargeStr = cells[schema.charge] ?? "";
      const clientHint = schema.client >= 0 ? (cells[schema.client] ?? "") : "";
      const invoicedFlag = schema.invoiced >= 0 ? (cells[schema.invoiced] ?? "").trim().toLowerCase() : "";
      if (!agent || !chargeStr) continue;
      const amount = Number(chargeStr.replace(/["$,\s]/g, ""));
      if (Number.isNaN(amount) || amount === 0) continue;
      const isoDate = parseLooseDate(dateStr);
      const invoicedStatus: "yes" | "no" | "blank" =
        invoicedFlag === "yes" || invoicedFlag === "y"
          ? "yes"
          : invoicedFlag === "no" || invoicedFlag === "n"
            ? "no"
            : "blank";
      out.push({ fileKey, fileName, raw, name: agent, amount, date: isoDate, clientHint: clientHint || null, invoicedStatus });
    }
    return out;
  }
  // Fallback for simple "name, amount" CSVs without the SPIFFS TRACKER schema.
  // No INVOICED column → treat every row as "no" (eligible).
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
    out.push({ fileKey, fileName, raw: line, name, amount, date: null, clientHint: null, invoicedStatus: "no" });
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
function matchAll(rows: ParsedRow[], candidates: Candidate[]): Match[] {
  const result: Match[] = [];
  for (const r of rows) {
    // Inclusion rule: only rows where INVOICED TO CLIENT = "NO" are eligible.
    // YES = already billed, skip.
    // Blank = not yet marked ready, skip.
    // This replaces the previous date-range filter — date is now informational only.
    if (r.invoicedStatus !== "no") {
      result.push({ row: r, employeeId: null, score: 0 });
      continue;
    }
    // clientHint matches either the canonical client_name or any declared alias
    // (normalized). Aliases live on clients.aliases — see add_clients_aliases
    // migration. This lets a sheet column reading "HFB" match a DB client named
    // "HFB Tech" without renaming either side.
    const eligible = r.clientHint
      ? candidates.filter((c) => {
          const hint = normalize(r.clientHint!);
          if (normalize(c.client_name) === hint) return true;
          return c.client_aliases.some((a) => normalize(a) === hint);
        })
      : candidates;
    let best: { employeeId: string; score: number } | null = null;
    for (const c of eligible) {
      const s = scoreMatch(r.name, c.agent_name);
      if (s > 0 && (!best || s > best.score)) {
        best = { employeeId: c.employee_id, score: s };
      }
    }
    if (best && best.score >= 30) result.push({ row: r, employeeId: best.employeeId, score: best.score });
    else result.push({ row: r, employeeId: null, score: 0 });
  }
  return result;
}

/* ----- props + component ----- */

interface PreviewSpiffUploadDialogProps {
  preview: ClientPreview[];
  weekStart: string;
  weekEnd: string;
  stagedSpiffs: Map<string, number>;            // current state from parent
  onApply: (next: Map<string, number>) => void; // bubble up to parent
}

export function PreviewSpiffUploadDialog({ preview, weekStart, weekEnd, stagedSpiffs, onApply }: PreviewSpiffUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Array<{ key: string; name: string; text: string }>>([]);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({}); // rowKey → employeeId | null
  const [applying, setApplying] = useState(false);

  // Side-fetch client aliases. The preview RPC doesn't carry them, but client_id
  // does, so we join in memory. Tiny table — fetch once and cache.
  const { data: aliasesByClientId } = useQuery({
    queryKey: ["client-aliases"],
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase.from("clients").select("id, aliases");
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const row of (data ?? []) as Array<{ id: string; aliases: string[] | null }>) {
        map[row.id] = row.aliases ?? [];
      }
      return map;
    },
    staleTime: 5 * 60 * 1000, // aliases don't change often
  });

  // Flatten preview into candidates, attaching each client's aliases
  const candidates: Candidate[] = useMemo(() => {
    const out: Candidate[] = [];
    for (const c of preview) {
      const aliases = aliasesByClientId?.[c.client_id] ?? [];
      for (const l of c.lines) {
        out.push({
          employee_id: l.employee_id,
          agent_name: l.employee_name,
          client_id: c.client_id,
          client_name: c.client_name,
          client_aliases: aliases,
        });
      }
    }
    return out;
  }, [preview, aliasesByClientId]);

  const allRows: ParsedRow[] = useMemo(() => {
    return files.flatMap((f) => parseCsvText(f.text, f.name, f.key));
  }, [files]);

  const matches = useMemo(
    () => matchAll(allRows, candidates),
    [allRows, candidates],
  );

  function rowKey(r: ParsedRow): string {
    return `${r.fileKey}::${r.raw}`;
  }
  function effectiveEmpId(m: Match): string | null {
    const o = overrides[rowKey(m.row)];
    if (o === undefined) return m.employeeId;
    return o;
  }

  const finalAssignmentsRaw = matches.map((m) => ({ m, employeeId: effectiveEmpId(m) }));
  const matchedCount = finalAssignmentsRaw.filter((f) => f.employeeId).length;
  const totalAmount = finalAssignmentsRaw.filter((f) => f.employeeId).reduce((s, f) => s + f.m.row.amount, 0);

  const finalAssignments = [...finalAssignmentsRaw].sort((a, b) => {
    // Matched first, then unmatched-but-eligible, then skipped (yes/blank).
    const order = (f: typeof a) => {
      if (f.employeeId) return 0;
      if (f.m.row.invoicedStatus === "no") return 1;       // eligible but unmatched
      if (f.m.row.invoicedStatus === "yes") return 2;
      return 3; // blank
    };
    const oa = order(a), ob = order(b);
    if (oa !== ob) return oa - ob;
    const da = a.m.row.date ?? "9999";
    const db = b.m.row.date ?? "9999";
    if (da !== db) return da.localeCompare(db);
    return a.m.row.name.localeCompare(b.m.row.name);
  });

  const bucketed = useMemo(() => {
    let matched = 0, unmatched = 0, skippedYes = 0, skippedBlank = 0;
    for (const m of matches) {
      if (m.employeeId) { matched++; continue; }
      if (m.row.invoicedStatus === "yes") { skippedYes++; continue; }
      if (m.row.invoicedStatus === "blank") { skippedBlank++; continue; }
      unmatched++;
    }
    return { matched, unmatched, skippedYes, skippedBlank };
  }, [matches]);

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

  async function handleStage() {
    if (matchedCount === 0) {
      toast.error("No matched rows to stage.");
      return;
    }
    setApplying(true);
    try {
      // Aggregate across all rows for the same employee_id (one agent may have many spiff rows in a week)
      const next = new Map<string, number>(stagedSpiffs);
      for (const f of finalAssignments) {
        if (!f.employeeId) continue;
        next.set(f.employeeId, (next.get(f.employeeId) ?? 0) + f.m.row.amount);
      }
      onApply(next);
      toast.success(`Staged ${fmtUSD(totalAmount)} of spiffs across ${matchedCount} row${matchedCount === 1 ? "" : "s"}.`);
      setOpen(false);
      setFiles([]);
      setOverrides({});
    } finally {
      setApplying(false);
    }
  }

  function handleClearStaged() {
    if (stagedSpiffs.size === 0) return;
    if (!confirm("Clear all staged spiffs for this preview?")) return;
    onApply(new Map());
    toast.success("Cleared staged spiffs.");
  }

  const stagedCount = stagedSpiffs.size;
  const stagedTotal = Array.from(stagedSpiffs.values()).reduce((s, v) => s + v, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFiles([]); setOverrides({}); } }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          {stagedCount > 0 ? `Spiffs staged: ${stagedCount} agent${stagedCount === 1 ? "" : "s"}, ${fmtUSD(stagedTotal)}` : "Upload Spiffs"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Upload spiff CSVs</DialogTitle>
          <DialogDescription>
            Drop in one or many CSVs. Rows match against the preview agents and stage in memory. They commit when you click "Generate all drafts."
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Staged-spiffs banner */}
          {stagedCount > 0 && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-green-300 bg-green-50">
              <span className="text-sm text-green-900">
                <CheckCircle2 className="h-4 w-4 inline-block mr-1" />
                <strong>{stagedCount}</strong> agent{stagedCount === 1 ? "" : "s"} staged with <strong>{fmtUSD(stagedTotal)}</strong> total. Add more files or click Stage again to merge.
              </span>
              <Button variant="ghost" size="sm" onClick={handleClearStaged}>Clear staged</Button>
            </div>
          )}

          {/* Scope info */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground">
              Target week: {weekStart} → {weekEnd} · {candidates.length} preview agents available · Only rows where <code className="text-foreground bg-muted px-1 rounded">INVOICED TO CLIENT = NO</code> will apply
            </span>
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

          {/* Preview */}
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
                  {bucketed.skippedYes > 0 && (
                    <span className="text-muted-foreground">{bucketed.skippedYes} already invoiced</span>
                  )}
                  {bucketed.skippedBlank > 0 && (
                    <span className="text-muted-foreground">{bucketed.skippedBlank} not marked ready</span>
                  )}
                  <span className="font-medium">{fmtUSD(totalAmount)} to stage</span>
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
                      <th className="text-left p-2">Match (preview agent)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalAssignments.map((f, i) => {
                      const status = f.m.row.invoicedStatus;
                      const isSkippedYes = status === "yes";
                      const isSkippedBlank = status === "blank";
                      const isSkipped = isSkippedYes || isSkippedBlank;
                      let rowBg = "";
                      if (isSkipped) rowBg = "bg-muted/30 text-muted-foreground";
                      else if (!f.employeeId) rowBg = "bg-amber-50/40";
                      const candidate = candidates.find((c) => c.employee_id === f.employeeId);
                      return (
                        <tr key={i} className={`border-t ${rowBg}`}>
                          <td className="p-2 font-mono">{f.m.row.date ?? "—"}</td>
                          <td className="p-2">{f.m.row.name}</td>
                          <td className="p-2 text-muted-foreground">{f.m.row.clientHint ?? "—"}</td>
                          <td className="p-2 text-right font-mono">{fmtUSD(f.m.row.amount)}</td>
                          <td className="p-2">
                            {isSkippedYes ? (
                              <span className="text-muted-foreground">INVOICED=YES · already billed</span>
                            ) : isSkippedBlank ? (
                              <span className="text-muted-foreground">INVOICED blank · not marked ready</span>
                            ) : (
                              <>
                                <Select
                                  value={f.employeeId ?? "__none__"}
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
                                      .sort((a, b) => a.client_name.localeCompare(b.client_name) || a.agent_name.localeCompare(b.agent_name))
                                      .map((c) => (
                                        <SelectItem key={c.employee_id} value={c.employee_id}>
                                          [{c.client_name}] {c.agent_name}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                                {candidate && f.m.score > 0 && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    auto-matched · {f.m.score}% · {candidate.client_name}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleStage} disabled={applying || matchedCount === 0}>
            {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Stage {matchedCount > 0 ? `${matchedCount} row${matchedCount === 1 ? "" : "s"} · ${fmtUSD(totalAmount)}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
