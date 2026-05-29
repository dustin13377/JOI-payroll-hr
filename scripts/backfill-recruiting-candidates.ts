/**
 * Backfill candidates from a CSV exported from Gmail / manually compiled.
 *
 * Usage:
 *   SUPABASE_URL=<...> SUPABASE_SERVICE_ROLE_KEY=<...> \
 *   npx tsx scripts/backfill-recruiting-candidates.ts <path-to-csv>
 *
 * CSV columns (header row required, all columns optional except full_name):
 *   full_name,curp,phone,email,role_interest,english_level_self,applied_at,applicant_notes
 *
 * - full_name: REQUIRED. Anything missing this is skipped with a warning.
 * - curp: 18-char Mexican national ID. If present and already in the table, the row is SKIPPED (not updated). Leave blank if unknown.
 * - phone: WhatsApp number. If 10 digits, +52 is prepended. If 12 digits starting with 52, + is prepended. Otherwise passed through.
 * - email: optional — many form applicants don't have this.
 * - role_interest: one of `b2b_setter`, `funding_activation`, `customer_reactivation`, or blank (for "Open" or unknown)
 * - english_level_self: one of `C1`, `C2`, `below_c1`, `unknown`. Defaults to `unknown` if blank.
 * - applied_at: ISO date or anything Date.parse can handle (e.g. "2026-04-15"). Defaults to now if blank.
 * - applicant_notes: free text for any context the user wants captured.
 *
 * Idempotency:
 *   1. If a row has curp AND a matching curp already exists in the DB, the row is SKIPPED.
 *   2. If a row has no curp but a phone that matches an existing row (and that existing row has no curp), it is also SKIPPED.
 *      This catches re-runs of the backfill where curp was unknown but phone was given.
 *   3. Otherwise the row is INSERTED with stage = 'new'.
 *
 * The script prints inserted/skipped/errors counts at the end. Exits with code 0 on success,
 * 1 on usage error or fatal lookup failure.
 */
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: npx tsx scripts/backfill-recruiting-candidates.ts <csv-path>");
  process.exit(1);
}

const VALID_ROLES = new Set([
  "b2b_setter",
  "funding_activation",
  "customer_reactivation",
]);
const VALID_ENGLISH = new Set(["C1", "C2", "below_c1", "unknown"]);

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return raw.trim() || null;
}

interface Row {
  full_name?: string;
  curp?: string;
  phone?: string;
  email?: string;
  role_interest?: string;
  english_level_self?: string;
  applied_at?: string;
  applicant_notes?: string;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
const csvText = readFileSync(resolve(csvPath), "utf8");
const rows = parse(csvText, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
}) as Row[];

let inserted = 0;
let skipped = 0;
let errors = 0;
const skippedReasons: Record<string, number> = {};

function bumpSkipped(reason: string) {
  skipped++;
  skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
}

for (const row of rows) {
  const full_name = row.full_name?.trim() || null;
  if (!full_name) {
    bumpSkipped("missing_full_name");
    continue;
  }

  const curp = row.curp?.trim() || null;
  const phone = normalizePhone(row.phone);

  // Dedup check 1: by curp
  if (curp) {
    const { data: existing, error } = await supabase
      .from("recruiting_candidates")
      .select("id")
      .eq("curp", curp)
      .maybeSingle();
    if (error) {
      console.error(`curp lookup failed for ${full_name} (${curp}):`, error.message);
      errors++;
      continue;
    }
    if (existing) {
      bumpSkipped("curp_already_exists");
      continue;
    }
  }

  // Dedup check 2: by phone (only when no curp was provided)
  if (!curp && phone) {
    const { data: existing, error } = await supabase
      .from("recruiting_candidates")
      .select("id, curp")
      .eq("phone", phone)
      .is("curp", null)
      .maybeSingle();
    if (error) {
      console.error(`phone lookup failed for ${full_name} (${phone}):`, error.message);
      errors++;
      continue;
    }
    if (existing) {
      bumpSkipped("phone_already_exists_no_curp");
      continue;
    }
  }

  // Normalize enums
  const role_interest = row.role_interest && VALID_ROLES.has(row.role_interest)
    ? row.role_interest
    : null;
  const english_level_self = row.english_level_self && VALID_ENGLISH.has(row.english_level_self)
    ? row.english_level_self
    : "unknown";

  const appliedAt = row.applied_at
    ? (() => {
        const d = new Date(row.applied_at);
        return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      })()
    : new Date().toISOString();

  const { error: insertErr } = await supabase
    .from("recruiting_candidates")
    .insert({
      source: "form",
      full_name,
      curp,
      phone,
      email: row.email?.trim() || null,
      role_interest,
      english_level_self,
      applicant_notes: row.applicant_notes?.trim() || null,
      raw_email_received_at: appliedAt,
      created_at: appliedAt,
      needs_manual_review: !phone,
      stage: "new",
    });

  if (insertErr) {
    console.error(`insert failed for ${full_name}:`, insertErr.message);
    errors++;
  } else {
    inserted++;
  }
}

console.log(`done. inserted=${inserted} skipped=${skipped} errors=${errors}`);
if (Object.keys(skippedReasons).length) {
  console.log("skipped breakdown:");
  for (const [reason, count] of Object.entries(skippedReasons)) {
    console.log(`  ${reason}: ${count}`);
  }
}
