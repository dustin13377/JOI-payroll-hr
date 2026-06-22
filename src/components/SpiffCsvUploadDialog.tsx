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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, AlertTriangle, FileSpreadsheet, X, Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBulkCreateSpiffs, type SpiffAgent } from "@/hooks/useSpiffs";

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
  locked: boolean; // manager confirmed this row against the master sheet → goes live
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
  createdBy: string;
}

export default function SpiffCsvUploadDialog({ agents, createdBy }: Props) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  // Existing (already-in-DB) spiff signatures covering the dates in this file,
  // for duplicate detection across any week (status != void).
  const [dbKeys, setDbKeys] = useState<Set<string>>(new Set());
  // Post-upload spot-check list — what actually went in, in CSV order.
  const [result, setResult] = useState<{
    rows: {
      name: string;
      client: string;
      date: string;
      amount: number;
      reason: string;
      live: boolean;
    }[];
    liveN: number;
    parkN: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bulkCreate = useBulkCreateSpiffs();

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  function reset() {
    setFileName(null);
    setRows([]);
    setDbKeys(new Set());
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = String(e.target?.result ?? "");
      const parsed = parseCsvText(text);
      if (parsed.length === 0) {
        toast.error("No spiff rows found in that file.");
        return;
      }
      const reviewed: ReviewRow[] = parsed.map((p) => {
        // Best agent match — compare against both work name and legal name, so
        // someone whose work name is an alias (e.g. "Crystal Smith" for "Zhenia
        // Cristel Hernández Bravo") still matches a sheet that uses legal names.
        let best: { id: string; score: number } | null = null;
        for (const a of agents) {
          const s = Math.max(
            scoreMatch(p.rawName, a.display_name),
            a.full_name ? scoreMatch(p.rawName, a.full_name) : 0
          );
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
          locked: false,
        };
      });
      setFileName(file.name);
      setRows(reviewed);

      // Pull existing spiffs spanning this file's date range for dup detection.
      const dates = reviewed.map((r) => r.spiff_date).filter(Boolean).sort();
      if (dates.length > 0) {
        const { data } = await supabase
          .from("spiffs")
          .select("employee_id, spiff_date, amount_usd")
          .gte("spiff_date", dates[0])
          .lte("spiff_date", dates[dates.length - 1])
          .neq("status", "void");
        const keys = new Set(
          ((data ?? []) as { employee_id: string; spiff_date: string; amount_usd: number }[]).map(
            (s) => `${s.employee_id}|${s.spiff_date}|${Number(s.amount_usd)}`
          )
        );
        setDbKeys(keys);
      } else {
        setDbKeys(new Set());
      }
    };
    reader.readAsText(file);
  }

  function updateRow(localId: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function removeRow(localId: number) {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  }

  function toggleLock(localId: number) {
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, locked: !r.locked } : r))
    );
  }

  // Batch median (for outlier detection) over positive amounts.
  const median = useMemo(() => {
    const amts = rows.map((r) => r.amount_usd).filter((n) => n > 0).sort((a, b) => a - b);
    if (amts.length === 0) return 0;
    const mid = Math.floor(amts.length / 2);
    return amts.length % 2 ? amts[mid] : (amts[mid - 1] + amts[mid]) / 2;
  }, [rows]);

  function flagsFor(row: ReviewRow): Flag[] {
    const flags: Flag[] = [];
    if (!row.employee_id) flags.push({ level: "error", label: "No agent — pick one" });
    else if (!agentMap.get(row.employee_id)?.client_id)
      flags.push({ level: "error", label: "Agent has no client" });
    if (!row.spiff_date) flags.push({ level: "error", label: "No date" });
    if (!(row.amount_usd > 0)) flags.push({ level: "error", label: "Bad amount" });

    if (row.amount_usd > HIGH_AMOUNT_USD)
      flags.push({ level: "warn", label: "Unusually high" });
    if (median > 0 && row.amount_usd >= 100 && row.amount_usd > median * OUTLIER_MULTIPLE)
      flags.push({ level: "warn", label: "Far above the rest — extra zero?" });

    // Duplicate within this batch, or already in the database for that day.
    if (row.employee_id && row.spiff_date) {
      const dupInBatch = rows.some(
        (o) =>
          o.localId !== row.localId &&
          o.employee_id === row.employee_id &&
          o.spiff_date === row.spiff_date &&
          o.amount_usd === row.amount_usd
      );
      if (dupInBatch) flags.push({ level: "warn", label: "Duplicate in this file" });
      if (dbKeys.has(`${row.employee_id}|${row.spiff_date}|${row.amount_usd}`))
        flags.push({ level: "warn", label: "Already in the system" });
    }
    return flags;
  }

  const rowsWithFlags = rows.map((r) => {
    const flags = flagsFor(r);
    return { row: r, flags, hasError: flags.some((f) => f.level === "error") };
  });
  const blockedCount = rowsWithFlags.filter((r) => r.hasError).length;
  const okCount = rows.length - blockedCount;
  const lockedCount = rows.filter((r) => r.locked).length;
  const parkedCount = okCount - lockedCount; // valid but not locked → upload as unverified

  // "Lock all" locks every error-free row; if all are already locked, unlock all.
  const allValidLocked = okCount > 0 && lockedCount === okCount;
  function toggleLockAll() {
    setRows((prev) => {
      const lockTarget = !allValidLocked;
      return prev.map((r) => {
        const hasError = flagsFor(r).some((f) => f.level === "error");
        if (hasError) return { ...r, locked: false };
        return { ...r, locked: lockTarget };
      });
    });
  }

  async function handleSave() {
    const saveable = rowsWithFlags.filter((r) => !r.hasError);
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
            verified: row.locked, // locked = confirmed against the sheet → live
          };
        }),
      });
      // Build the spot-check list (CSV order preserved).
      const summaryRows = saveable.map(({ row }) => {
        const agent = agentMap.get(row.employee_id)!;
        return {
          name: agent.display_name,
          client: agent.client_name,
          date: row.spiff_date,
          amount: row.amount_usd,
          reason: row.reason.trim() || "Spiff (CSV import)",
          live: row.locked,
        };
      });
      const liveN = summaryRows.filter((r) => r.live).length;
      const parkN = summaryRows.length - liveN;
      toast.success(
        parkN > 0
          ? `${liveN} verified (live), ${parkN} parked as unverified`
          : `${liveN} spiff${liveN !== 1 ? "s" : ""} verified and live`
      );
      setResult({ rows: summaryRows, liveN, parkN });
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
      <DialogContent className="max-w-4xl w-[95vw] overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle>Upload spiffs from CSV</DialogTitle>
          <DialogDescription>
            Check each row against your master sheet, then{" "}
            <strong>lock it in</strong>. Locked rows go live (invoice + agent pay);
            unlocked rows are parked as unverified for later.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <Badge variant="outline" className="border-green-500 text-green-700">
                {result.liveN} live
              </Badge>
              {result.parkN > 0 && (
                <Badge variant="outline" className="border-amber-400 text-amber-700">
                  {result.parkN} parked
                </Badge>
              )}
              <span className="text-muted-foreground">
                — spot-check these against your sheet
              </span>
            </div>
            <div className="max-h-[55vh] overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left font-medium p-2">Agent</th>
                    <th className="text-left font-medium p-2">Date</th>
                    <th className="text-right font-medium p-2">Amount</th>
                    <th className="text-left font-medium p-2">Reason</th>
                    <th className="text-left font-medium p-2">Client</th>
                    <th className="text-left font-medium p-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="p-2 font-medium">{r.name}</td>
                      <td className="p-2">
                        {new Date(r.date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="p-2 text-right">
                        ${r.amount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="p-2">{r.reason}</td>
                      <td className="p-2">{r.client}</td>
                      <td className="p-2">
                        {r.live ? (
                          <Badge
                            variant="outline"
                            className="border-green-500 text-green-700"
                          >
                            Live
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-400 text-amber-700"
                          >
                            Parked
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-background border-t">
                  <tr className="font-medium">
                    <td className="p-2" colSpan={2}>
                      Total ({result.rows.length})
                    </td>
                    <td className="p-2 text-right">
                      ${result.rows
                        .reduce((s, r) => s + r.amount, 0)
                        .toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : rows.length === 0 ? (
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
            <div className="flex items-center gap-2 flex-wrap justify-between text-sm">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-muted-foreground truncate max-w-[200px]">
                  {fileName}
                </span>
                <Badge variant="outline" className="border-green-500 text-green-700">
                  {lockedCount} locked
                </Badge>
                {parkedCount > 0 && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700">
                    {parkedCount} unlocked
                  </Badge>
                )}
                {blockedCount > 0 && (
                  <Badge variant="outline" className="border-red-400 text-red-700">
                    {blockedCount} need fixing
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={okCount === 0}
                  onClick={toggleLockAll}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {allValidLocked ? "Unlock all" : "Lock all"}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={reset}>
                  Different file
                </Button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto overflow-x-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left font-medium p-2 min-w-[170px]">Agent</th>
                    <th className="text-left font-medium p-2 min-w-[130px]">Date</th>
                    <th className="text-left font-medium p-2 min-w-[100px]">Amount</th>
                    <th className="text-left font-medium p-2 min-w-[150px]">Reason</th>
                    <th className="text-left font-medium p-2 min-w-[170px]">Flags</th>
                    <th className="p-2 w-[150px] text-right">Lock in</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rowsWithFlags.map(({ row, flags, hasError }) => {
                    return (
                      <tr
                        key={row.localId}
                        className={
                          row.locked
                            ? "bg-green-50/60"
                            : hasError
                            ? "bg-red-50/50"
                            : undefined
                        }
                      >
                        {/* Agent (matched label or override picker) */}
                        <td className="p-2 align-top">
                          <Select
                            value={row.employee_id || undefined}
                            disabled={row.locked}
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
                            disabled={row.locked}
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
                            disabled={row.locked}
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
                            disabled={row.locked}
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

                        {/* Lock in / remove */}
                        <td className="p-2 align-top">
                          <div className="flex items-center justify-end gap-3">
                            <Button
                              type="button"
                              variant={row.locked ? "default" : "outline"}
                              size="sm"
                              title={
                                hasError ? "Fix the red flags before locking" : undefined
                              }
                              className={`h-8 px-2.5 ${
                                row.locked
                                  ? "bg-green-600 hover:bg-green-700 text-white border-green-600"
                                  : "text-green-700 border-green-500 hover:bg-green-50"
                              }`}
                              disabled={hasError}
                              onClick={() => toggleLock(row.localId)}
                            >
                              {row.locked ? (
                                <>
                                  <Lock className="h-3.5 w-3.5 mr-1" />
                                  Locked
                                </>
                              ) : (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  Lock
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Remove row"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeRow(row.localId)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result ? (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={reset}>
              Upload another file
            </Button>
            <Button
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        ) : rows.length > 0 ? (
          <DialogFooter className="gap-2">
            <span className="text-xs text-muted-foreground mr-auto self-center">
              {lockedCount} go live · {parkedCount} parked
              {blockedCount > 0 ? ` · ${blockedCount} skipped (red flags)` : ""}
            </span>
            <Button
              onClick={handleSave}
              disabled={bulkCreate.isPending || okCount === 0}
            >
              {bulkCreate.isPending ? "Uploading…" : `Upload ${okCount}`}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
