/**
 * SpiffCsvUploadDialog — bulk-upload spiffs from a CSV (same format as the
 * spiffs tracker sheet: Date, Agent, Charge to Client, Client, Invoiced).
 *
 * Flow:
 *   1. Manager drops in a CSV.
 *   2. Each row is parsed, the agent name fuzzy-matched against the manager's
 *      agents, and the amount checked for fat-finger flags.
 *   3. Manager reviews — fixes unmatched rows, eyeballs flagged amounts against
 *      their Google Sheet — then saves.
 *   4. Rows insert as status='unverified' (source='csv_import'): invisible to
 *      pay + billing until verified back on the Spiffs page.
 *
 * Manager+ only (gated by the caller).
 */

import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, AlertTriangle, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import {
  useBulkCreateSpiffs,
  type SpiffAgent,
  type SpiffRow,
} from "@/hooks/useSpiffs";

/* ------------------------------------------------------------------ */
/*  Tunables                                                           */
/* ------------------------------------------------------------------ */

// Real JOI spiffs run roughly $5–$120. Anything above this gets a second look.
const HIGH_AMOUNT_USD = 250;
// A row this many times the batch median (and not tiny) is likely an extra zero.
const OUTLIER_MULTIPLE = 5;

/* ------------------------------------------------------------------ */
/*  Parser + match helpers (mirrors the spiffs tracker schema)         */
/* ------------------------------------------------------------------ */

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

/** "5/18/26" | "05/18/2026" | "2026-05-18" → "YYYY-MM-DD". null on failure. */
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

/** Split a CSV line, respecting quoted fields so "$2,000.00" stays one cell. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === "," && !inQuote) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectSchema(
  headerCells: string[]
): { date: number; agent: number; charge: number; client: number } | null {
  const norm = headerCells.map((c) => c.toLowerCase().trim());
  const date = norm.findIndex((c) => c === "date");
  const agent = norm.findIndex((c) => c === "agent" || c.startsWith("agent "));
  const charge = norm.findIndex((c) => c.includes("charge") && c.includes("client"));
  const client = norm.findIndex((c) => c === "client");
  if (date >= 0 && agent >= 0 && charge >= 0) return { date, agent, charge, client };
  return null;
}

interface RawRow {
  rawName: string;
  amount: number;
  date: string | null;
  reason: string;
  clientHint: string | null;
}

function parseCsvText(text: string): RawRow[] {
  const out: RawRow[] = [];
  const lines = text.split(/\r?\n/);
  const firstNonEmpty = lines.find((l) => l.trim() !== "");
  const headerCells = firstNonEmpty ? splitCsvLine(firstNonEmpty) : [];
  const schema = detectSchema(headerCells);
  // A "reason" column is optional; look for it by header name.
  const reasonIdx = headerCells.findIndex((c) =>
    /reason|note|spiff|place|prize/i.test(c)
  );

  if (schema) {
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      const cells = splitCsvLine(lines[i]);
      const agent = cells[schema.agent] ?? "";
      const chargeStr = cells[schema.charge] ?? "";
      if (!agent || !chargeStr) continue;
      const amount = Number(chargeStr.replace(/["$,\s]/g, ""));
      if (Number.isNaN(amount) || amount === 0) continue;
      out.push({
        rawName: agent,
        amount,
        date: parseLooseDate(cells[schema.date] ?? ""),
        reason: reasonIdx >= 0 ? (cells[reasonIdx] ?? "").trim() : "",
        clientHint: schema.client >= 0 ? (cells[schema.client] ?? "").trim() || null : null,
      });
    }
    return out;
  }

  // Fallback: "name, amount" pairs (rightmost numeric is the amount).
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
    out.push({ rawName: name, amount, date: null, reason: "", clientHint: null });
  }
  return out;
}

function scoreMatch(a0: string, b0: string): number {
  const a = tokenize(a0);
  const b = tokenize(b0);
  if (a.length === 0 || b.length === 0) return 0;
  if (normalize(a0) === normalize(b0)) return 100;
  const bSet = new Set(b);
  let shared = 0;
  for (const t of new Set(a)) if (bSet.has(t)) shared += 1;
  if (shared === 0) {
    if (normalize(b0).includes(normalize(a0))) return 30;
    if (normalize(a0).includes(normalize(b0))) return 25;
    return 0;
  }
  let score = shared * 20;
  if (a[0] === b[0]) score += 15;
  if (a[a.length - 1] === b[b.length - 1]) score += 25;
  for (const t of a) {
    if (t.length < 3) continue;
    if (b.some((x) => x.startsWith(t) || t.startsWith(x))) score += 5;
  }
  return Math.min(score, 95);
}

/* ------------------------------------------------------------------ */
/*  Review-row model                                                   */
/* ------------------------------------------------------------------ */

interface ReviewRow {
  localId: number;
  rawName: string;
  employee_id: string; // matched/overridden, "" if unmatched
  matchScore: number;
  spiff_date: string;
  amount_usd: number;
  reason: string;
}

interface Flag {
  level: "error" | "warn";
  label: string;
}

let nextId = 1;

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  agents: SpiffAgent[];
  weekStart: string;
  weekEnd: string;
  existing: SpiffRow[]; // this week's spiffs, for duplicate detection
  createdBy: string;
}

export default function SpiffCsvUploadDialog({
  agents,
  weekStart,
  weekEnd,
  existing,
  createdBy,
}: Props) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bulkCreate = useBulkCreateSpiffs();

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  function reset() {
    setFileName(null);
    setRows([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      const parsed = parseCsvText(text);
      if (parsed.length === 0) {
        toast.error("No spiff rows found in that file.");
        return;
      }
      const reviewed: ReviewRow[] = parsed.map((p) => {
        // Best agent match by name.
        let best: { id: string; score: number } | null = null;
        for (const a of agents) {
          const s = scoreMatch(p.rawName, a.display_name);
          if (s > 0 && (!best || s > best.score)) best = { id: a.id, score: s };
        }
        const matched = best && best.score >= 30 ? best : null;
        return {
          localId: nextId++,
          rawName: p.rawName,
          employee_id: matched?.id ?? "",
          matchScore: matched?.score ?? 0,
          spiff_date: p.date ?? "",
          amount_usd: p.amount,
          reason: p.reason,
        };
      });
      setFileName(file.name);
      setRows(reviewed);
    };
    reader.readAsText(file);
  }

  function updateRow(localId: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function removeRow(localId: number) {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  }

  // Batch median (for outlier detection) over positive amounts.
  const median = useMemo(() => {
    const amts = rows.map((r) => r.amount_usd).filter((n) => n > 0).sort((a, b) => a - b);
    if (amts.length === 0) return 0;
    const mid = Math.floor(amts.length / 2);
    return amts.length % 2 ? amts[mid] : (amts[mid - 1] + amts[mid]) / 2;
  }, [rows]);

  // Existing (already-in-DB) signatures for this week, for duplicate detection.
  const existingKeys = useMemo(
    () => new Set(existing.map((s) => `${s.employee_id}|${s.spiff_date}|${s.amount_usd}`)),
    [existing]
  );

  function flagsFor(row: ReviewRow): Flag[] {
    const flags: Flag[] = [];
    if (!row.employee_id) flags.push({ level: "error", label: "No agent — pick one" });
    else if (!agentMap.get(row.employee_id)?.client_id)
      flags.push({ level: "error", label: "Agent has no client" });
    if (!row.spiff_date) flags.push({ level: "error", label: "No date" });
    if (!(row.amount_usd > 0)) flags.push({ level: "error", label: "Bad amount" });

    if (row.spiff_date && (row.spiff_date < weekStart || row.spiff_date > weekEnd))
      flags.push({ level: "warn", label: "Date outside this week" });
    if (row.amount_usd > HIGH_AMOUNT_USD)
      flags.push({ level: "warn", label: "Unusually high" });
    if (median > 0 && row.amount_usd >= 100 && row.amount_usd > median * OUTLIER_MULTIPLE)
      flags.push({ level: "warn", label: "Far above the rest — extra zero?" });

    // Duplicate within this batch.
    if (row.employee_id && row.spiff_date) {
      const dupInBatch = rows.some(
        (o) =>
          o.localId !== row.localId &&
          o.employee_id === row.employee_id &&
          o.spiff_date === row.spiff_date &&
          o.amount_usd === row.amount_usd
      );
      if (dupInBatch) flags.push({ level: "warn", label: "Duplicate in this file" });
      if (existingKeys.has(`${row.employee_id}|${row.spiff_date}|${row.amount_usd}`))
        flags.push({ level: "warn", label: "Already entered this week" });
    }
    return flags;
  }

  const rowsWithFlags = rows.map((r) => ({ row: r, flags: flagsFor(r) }));
  const blockedCount = rowsWithFlags.filter((r) =>
    r.flags.some((f) => f.level === "error")
  ).length;
  const warnCount = rowsWithFlags.filter((r) =>
    r.flags.some((f) => f.level === "warn")
  ).length;
  const okCount = rows.length - blockedCount;

  async function handleSave() {
    const saveable = rowsWithFlags.filter((r) => !r.flags.some((f) => f.level === "error"));
    if (saveable.length === 0) {
      toast.error("No rows are ready to save — resolve the red flags first.");
      return;
    }
    try {
      await bulkCreate.mutateAsync({
        created_by: createdBy,
        rows: saveable.map(({ row }) => {
          const agent = agentMap.get(row.employee_id)!;
          return {
            employee_id: row.employee_id,
            client_id: agent.client_id,
            spiff_date: row.spiff_date,
            amount_usd: row.amount_usd,
            reason: row.reason.trim() || "Spiff (CSV import)",
          };
        }),
      });
      toast.success(
        `${saveable.length} spiff${saveable.length !== 1 ? "s" : ""} uploaded — pending verification`
      );
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-1" />
          Upload CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Upload spiffs from CSV</DialogTitle>
          <DialogDescription>
            Same format as your tracker sheet (Date, Agent, Charge to Client, Client).
            Uploaded rows stay <strong>unverified</strong> — they don't count toward pay
            or billing until you verify them against your sheet.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="py-8">
            <label
              htmlFor="spiff-csv-input"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Choose a CSV file</span>
              <span className="text-xs text-muted-foreground">
                or drag &amp; drop it here
              </span>
            </label>
            <input
              id="spiff-csv-input"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-muted-foreground">{fileName}</span>
              <Badge variant="outline" className="border-green-400 text-green-700">
                {okCount} ready
              </Badge>
              {warnCount > 0 && (
                <Badge variant="outline" className="border-amber-400 text-amber-700">
                  {warnCount} flagged
                </Badge>
              )}
              {blockedCount > 0 && (
                <Badge variant="outline" className="border-red-400 text-red-700">
                  {blockedCount} need fixing
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={reset}
              >
                Choose a different file
              </Button>
            </div>

            <ScrollArea className="max-h-[50vh] border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left font-medium p-2 min-w-[170px]">Agent</th>
                    <th className="text-left font-medium p-2 min-w-[130px]">Date</th>
                    <th className="text-left font-medium p-2 min-w-[100px]">Amount</th>
                    <th className="text-left font-medium p-2 min-w-[150px]">Reason</th>
                    <th className="text-left font-medium p-2 min-w-[180px]">Flags</th>
                    <th className="p-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rowsWithFlags.map(({ row, flags }) => {
                    const hasError = flags.some((f) => f.level === "error");
                    return (
                      <tr
                        key={row.localId}
                        className={hasError ? "bg-red-50/50" : undefined}
                      >
                        {/* Agent (matched label or override picker) */}
                        <td className="p-2 align-top">
                          <Select
                            value={row.employee_id || undefined}
                            onValueChange={(v) => updateRow(row.localId, { employee_id: v })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue
                                placeholder={
                                  row.rawName ? `?? ${row.rawName}` : "Select agent"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {agents.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.display_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {row.employee_id && row.matchScore > 0 && row.matchScore < 60 && (
                            <span className="text-[10px] text-amber-600">
                              low-confidence match — confirm
                            </span>
                          )}
                          <div className="text-[10px] text-muted-foreground truncate">
                            from: {row.rawName}
                          </div>
                        </td>

                        {/* Date */}
                        <td className="p-2 align-top">
                          <Input
                            type="date"
                            className="h-8 text-sm"
                            value={row.spiff_date}
                            onChange={(e) =>
                              updateRow(row.localId, { spiff_date: e.target.value })
                            }
                          />
                        </td>

                        {/* Amount */}
                        <td className="p-2 align-top">
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="h-8 text-sm"
                            value={row.amount_usd}
                            onChange={(e) =>
                              updateRow(row.localId, {
                                amount_usd: Number(e.target.value),
                              })
                            }
                          />
                        </td>

                        {/* Reason */}
                        <td className="p-2 align-top">
                          <Input
                            className="h-8 text-sm"
                            placeholder="e.g. PB 6, 1ST PLACE"
                            value={row.reason}
                            onChange={(e) =>
                              updateRow(row.localId, { reason: e.target.value })
                            }
                          />
                        </td>

                        {/* Flags */}
                        <td className="p-2 align-top">
                          <div className="flex flex-col gap-1">
                            {flags.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              flags.map((f, i) => (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-1 text-[11px] ${
                                    f.level === "error"
                                      ? "text-red-600"
                                      : "text-amber-600"
                                  }`}
                                >
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  {f.label}
                                </span>
                              ))
                            )}
                          </div>
                        </td>

                        {/* Remove */}
                        <td className="p-2 align-top">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(row.localId)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}

        {rows.length > 0 && (
          <DialogFooter className="gap-2">
            {blockedCount > 0 && (
              <span className="text-xs text-muted-foreground mr-auto self-center">
                {blockedCount} row{blockedCount !== 1 ? "s" : ""} with red flags will be
                skipped.
              </span>
            )}
            <Button
              onClick={handleSave}
              disabled={bulkCreate.isPending || okCount === 0}
            >
              {bulkCreate.isPending
                ? "Uploading…"
                : `Upload ${okCount} as unverified`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
