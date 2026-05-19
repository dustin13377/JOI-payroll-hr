/**
 * submit-eod-for-agent edge function
 *
 * Lets a team lead (or leadership) file an EOD log on behalf of a new hire who
 * has no auth account yet. This is the "TL covers Day 1–30 for an agent who
 * doesn't have a login" path. Pairs with edit-time-clock for clock punches.
 *
 * Auth model:
 *   - owner / admin / manager: may submit for any employee in their org whose
 *     user_profiles row does not exist (target must have NO login).
 *   - team_lead: same, plus they must share a campaign with the target —
 *     either via employees.campaign_id OR via the team_lead_campaigns join.
 *
 * Body:
 *   {
 *     employee_id: uuid,
 *     date: 'YYYY-MM-DD',
 *     campaign_id: uuid,
 *     metrics: Record<string, unknown>,  // KPI field values
 *     notes?: string,
 *     reason: string                      // REQUIRED — why TL is filing this
 *   }
 *
 * Behavior:
 *   - Refuses if the target employee already has a user_profile (i.e. can log
 *     in themselves). Once they get an account, they file their own EOD.
 *   - UPSERT on (employee_id, date). New row OR update existing.
 *   - Stamps submitted_by_user_id = caller, so reports can show "filed by TL".
 *   - Writes an eod_logs_audit row capturing before/after state + reason.
 *   - Returns { eod_log: <new state>, audit_id, action }.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const callerEmployeeId = callerProfile?.employee_id;
    if (!callerRole || !["owner", "admin", "manager", "team_lead"].includes(callerRole)) {
      return json({ error: "Forbidden: leadership or team lead only" }, 403);
    }
    if (!callerOrgId) return json({ error: "Caller profile missing organization_id" }, 400);

    // ---- Parse + validate body ----
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { employee_id, date, campaign_id, metrics, notes, reason } = body;

    if (typeof employee_id !== "string" || !employee_id) {
      return json({ error: "employee_id is required" }, 400);
    }
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ error: "date must be YYYY-MM-DD" }, 400);
    }
    if (typeof campaign_id !== "string" || !campaign_id) {
      return json({ error: "campaign_id is required" }, 400);
    }
    if (typeof metrics !== "object" || metrics === null || Array.isArray(metrics)) {
      return json({ error: "metrics must be a JSON object" }, 400);
    }
    if (typeof reason !== "string" || reason.trim().length < 3) {
      return json({ error: "reason is required (min 3 chars)" }, 400);
    }
    if (notes !== undefined && typeof notes !== "string") {
      return json({ error: "notes must be a string if provided" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ---- Authorization: scope check ----
    const { data: target, error: targetErr } = await adminClient
      .from("employees")
      .select("id, organization_id, campaign_id, full_name")
      .eq("id", employee_id)
      .single();
    if (targetErr || !target) {
      return json({ error: "Target employee not found" }, 404);
    }
    if (target.organization_id !== callerOrgId) {
      return json({ error: "Cross-org submit blocked" }, 403);
    }

    // ---- "No login yet" gate ----
    //      Once the agent has a user_profiles row they file their own EOD.
    const { data: targetProfile } = await adminClient
      .from("user_profiles")
      .select("id")
      .eq("employee_id", employee_id)
      .maybeSingle();
    if (targetProfile) {
      return json({
        error: "This agent has a login — they need to submit their own EOD.",
      }, 403);
    }

    // ---- TL must share a campaign with the target ----
    if (callerRole === "team_lead") {
      // Check both linkage sources:
      //   1. caller's employees.campaign_id matches target's
      //   2. caller appears in team_lead_campaigns for target's campaign
      let sharesCampaign = false;

      const { data: tlEmp } = await adminClient
        .from("employees")
        .select("campaign_id")
        .eq("id", callerEmployeeId)
        .single();
      if (tlEmp?.campaign_id && tlEmp.campaign_id === target.campaign_id) {
        sharesCampaign = true;
      }

      if (!sharesCampaign && target.campaign_id) {
        const { data: joinRow } = await adminClient
          .from("team_lead_campaigns")
          .select("team_lead_id")
          .eq("team_lead_id", callerEmployeeId)
          .eq("campaign_id", target.campaign_id)
          .maybeSingle();
        if (joinRow) sharesCampaign = true;
      }

      if (!sharesCampaign) {
        return json({
          error: "TLs can only submit EOD for agents on their own campaign",
        }, 403);
      }
    }

    // Sanity: the campaign_id passed in body should match the target's campaign.
    // (Not strictly required but flags obvious mismatches.)
    if (target.campaign_id && target.campaign_id !== campaign_id) {
      return json({
        error: "campaign_id does not match the agent's assigned campaign",
      }, 400);
    }

    // ---- Load existing row (if any) for audit before/after ----
    const { data: existing } = await adminClient
      .from("eod_logs")
      .select("*")
      .eq("employee_id", employee_id)
      .eq("date", date)
      .maybeSingle();

    const action: "insert" | "update" = existing ? "update" : "insert";
    let saved: Record<string, unknown> | null = null;

    if (existing) {
      const { data: updated, error: updErr } = await adminClient
        .from("eod_logs")
        .update({
          metrics,
          notes: notes ?? existing.notes ?? null,
          submitted_by_user_id: caller.id,
          last_edited_at: new Date().toISOString(),
          edit_count: (existing.edit_count ?? 0) + 1,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (updErr) return json({ error: `UPDATE failed: ${updErr.message}` }, 500);
      saved = updated;
    } else {
      const { data: inserted, error: insErr } = await adminClient
        .from("eod_logs")
        .insert({
          employee_id,
          date,
          campaign_id,
          metrics,
          notes: notes ?? null,
          submitted_by_user_id: caller.id,
        })
        .select()
        .single();
      if (insErr) return json({ error: `INSERT failed: ${insErr.message}` }, 500);
      saved = inserted;
    }

    // ---- Write audit row ----
    const { data: auditRow, error: auditErr } = await adminClient
      .from("eod_logs_audit")
      .insert({
        eod_log_id: saved?.id,
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
    if (auditErr) {
      return json({
        warning: `EOD saved but audit log failed: ${auditErr.message}`,
        eod_log: saved,
      });
    }

    return json({ eod_log: saved, audit_id: auditRow.id, action });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
