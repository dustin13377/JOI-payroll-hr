/**
 * edit-time-clock edge function
 *
 * Allows HR/admin, manager, or team_lead to add or correct a time_clock row for
 * an employee. Used when someone forgot to clock in, was here on time, etc.
 *
 * Auth model:
 *   - owner / admin / manager: can edit anyone in their org
 *   - team_lead: can edit any agent in their org (campaign scoping removed
 *     2026-06-16 per D — weekday campaigns had no TL assigned, leaving agents
 *     uneditable. Cross-org edits are still blocked, and every edit is recorded
 *     in time_clock_audit with edited_by + reason.)
 *
 * Body:
 *   {
 *     employee_id: uuid,
 *     date: 'YYYY-MM-DD',     // local date in employee's tz
 *     clock_in?: ISO8601,     // optional fields — only what you want to set
 *     clock_out?: ISO8601,
 *     lunch_start?: ISO8601,
 *     lunch_end?: ISO8601,
 *     break1_start?: ISO8601,
 *     break1_end?: ISO8601,
 *     break2_start?: ISO8601,
 *     break2_end?: ISO8601,
 *     reason: string          // REQUIRED — what was being corrected and why
 *   }
 *
 * Behavior:
 *   - UPSERT on (employee_id, date). If a row exists for that day, UPDATEs the
 *     fields you passed; otherwise INSERTs a new row.
 *   - Writes a time_clock_audit row capturing before/after state + reason.
 *   - Returns { time_clock: <new state>, audit_id }.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS — env-driven allowlist. Closes audit finding H-1 (2026-05-27).
// See create-employee/index.ts for the full pattern explanation.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS_RAW =
  Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
const ALLOWED_ORIGINS = ALLOWED_ORIGINS_RAW
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Fields a caller is allowed to set via this function.
const EDITABLE_FIELDS = [
  "clock_in", "clock_out",
  "lunch_start", "lunch_end",
  "break1_start", "break1_end",
  "break2_start", "break2_end",
] as const;

type EditableField = typeof EDITABLE_FIELDS[number];

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ---- Verify caller ----
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: callerProfile } = await anonClient
      .from("user_profiles")
      .select("role, organization_id, employee_id")
      .eq("id", caller.id)
      .single();
    const callerRole = callerProfile?.role;
    const callerOrgId = callerProfile?.organization_id;
    if (!callerRole || !["owner", "admin", "manager", "team_lead"].includes(callerRole)) {
      return json({ error: "Forbidden: leadership or team lead only" }, 403);
    }
    if (!callerOrgId) return json({ error: "Caller profile missing organization_id" }, 400);

    // ---- Parse + validate body ----
    const body = await req.json().catch(() => ({}));
    const { employee_id, date, reason } = body as Record<string, unknown>;
    if (typeof employee_id !== "string" || !employee_id) {
      return json({ error: "employee_id is required" }, 400);
    }
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ error: "date must be YYYY-MM-DD" }, 400);
    }
    if (typeof reason !== "string" || reason.trim().length < 3) {
      return json({ error: "reason is required (min 3 chars)" }, 400);
    }

    // Build the edit payload from whitelisted fields
    const edits: Partial<Record<EditableField, string | null>> = {};
    for (const f of EDITABLE_FIELDS) {
      if (f in body) {
        const v = (body as Record<string, unknown>)[f];
        if (v === null || v === "") {
          edits[f] = null;
        } else if (typeof v === "string") {
          // basic shape check; let Postgres do the real validation
          edits[f] = v;
        } else {
          return json({ error: `${f} must be ISO timestamp string or null` }, 400);
        }
      }
    }
    if (Object.keys(edits).length === 0) {
      return json({ error: "No editable fields provided" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ---- Authorization: TL scope ----
    const { data: target, error: targetErr } = await adminClient
      .from("employees")
      .select("id, organization_id, campaign_id, full_name")
      .eq("id", employee_id)
      .single();
    if (targetErr || !target) {
      return json({ error: "Target employee not found" }, 404);
    }
    if (target.organization_id !== callerOrgId) {
      return json({ error: "Cross-org edit blocked" }, 403);
    }
    // Same-org check above is the only scope guard. Team leads may edit any
    // agent in their org (campaign restriction removed 2026-06-16). The audit
    // row below captures who made the edit and why.

    // ---- Load existing row (if any) for audit before/after ----
    const { data: existing } = await adminClient
      .from("time_clock")
      .select("*")
      .eq("employee_id", employee_id)
      .eq("date", date)
      .maybeSingle();

    const action: "insert" | "update" = existing ? "update" : "insert";
    let saved: Record<string, unknown> | null = null;

    if (existing) {
      const { data: updated, error: updErr } = await adminClient
        .from("time_clock")
        .update(edits)
        .eq("id", existing.id)
        .select()
        .single();
      if (updErr) return json({ error: `UPDATE failed: ${updErr.message}` }, 500);
      saved = updated;
    } else {
      // Need at least clock_in to insert a brand-new row
      if (!edits.clock_in) {
        return json({ error: "clock_in is required when creating a new punch" }, 400);
      }
      const { data: inserted, error: insErr } = await adminClient
        .from("time_clock")
        .insert({
          employee_id,
          date,
          ...edits,
          // sensible defaults for non-nullable columns
          auto_clocked_out: false,
          eod_completed: false,
          early_release: false,
        })
        .select()
        .single();
      if (insErr) return json({ error: `INSERT failed: ${insErr.message}` }, 500);
      saved = inserted;
    }

    // ---- Write audit row ----
    const { data: auditRow, error: auditErr } = await adminClient
      .from("time_clock_audit")
      .insert({
        time_clock_id: saved?.id,
        employee_id,
        date,
        edited_by: caller.id,
        action,
        before_state: existing ?? null,
        after_state: saved,
        reason: reason.trim(),
        organization_id: callerOrgId,
      })
      .select("id")
      .single();
    // Audit failure is non-fatal but we surface it.
    if (auditErr) {
      return json({
        warning: `Time clock saved but audit log failed: ${auditErr.message}`,
        time_clock: saved,
      });
    }

    return json({ time_clock: saved, audit_id: auditRow.id, action });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
