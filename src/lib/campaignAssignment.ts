import { supabase } from "@/integrations/supabase/client";
import { todayLocal } from "@/lib/localDate";

/**
 * Canonical helpers for changing an employee's campaign.
 *
 * WHY THIS EXISTS
 * ---------------
 * The invoice generator (weekly + monthly) discovers who to bill by joining
 * employees -> employee_campaign_assignments -> campaigns -> clients. It does
 * NOT look at employees.campaign_id. So any code path that changes an
 * employee's campaign MUST also maintain a matching row in
 * employee_campaign_assignments, or that agent silently drops off the client's
 * invoice (and keeps billing to whatever their old assignment pointed at).
 *
 * Previously the Campaign-detail page assigned/removed agents by only touching
 * employees.campaign_id, which is exactly how a new campaign ended up with an
 * agent but no invoice. Route every campaign change through these helpers so
 * the assignment history and the campaign_id pointer never drift apart.
 */

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Move an employee onto a campaign, keeping employee_campaign_assignments in
 * sync: close any open assignment that started before the effective date and
 * open a new one, then update the employees.campaign_id pointer.
 */
export async function moveEmployeeToCampaign(opts: {
  employeeUuid: string;
  newCampaignId: string;
  effectiveDate?: string; // defaults to today (local)
  reason?: string | null;
}): Promise<void> {
  const { employeeUuid, newCampaignId } = opts;
  const effectiveDate = opts.effectiveDate ?? todayLocal();
  const reason = opts.reason?.trim() || null;

  // 1. organization_id is NOT NULL on employee_campaign_assignments.
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("organization_id" as any)
    .eq("id", newCampaignId)
    .single();
  if (cErr) throw cErr;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId = (campaign as any).organization_id as string;

  // 2. Any currently-open assignment rows.
  const { data: openRows, error: openErr } = await supabase
    .from("employee_campaign_assignments")
    .select("id, start_date, campaign_id")
    .eq("employee_id", employeeUuid)
    .is("end_date", null);
  if (openErr) throw openErr;

  // No-op if already on this campaign with an open row.
  const alreadyOpen = (openRows ?? []).find((r) => r.campaign_id === newCampaignId);
  if (alreadyOpen) {
    // Still make sure the pointer matches.
    const { error: updErr } = await supabase
      .from("employees")
      .update({ campaign_id: newCampaignId })
      .eq("id", employeeUuid);
    if (updErr) throw updErr;
    return;
  }

  // Same-day replacement: an open row already starts on the effective date.
  // Closing it (end = day before) would make end_date < start_date and break
  // the check constraint, so update it in place instead.
  const sameDay = (openRows ?? []).find((r) => r.start_date === effectiveDate);
  if (sameDay) {
    const { error: repErr } = await supabase
      .from("employee_campaign_assignments")
      .update({ campaign_id: newCampaignId, reason, organization_id: orgId })
      .eq("id", sameDay.id);
    if (repErr) throw repErr;
  } else {
    // 3a. Close open assignments that started before the effective date.
    const { error: closeErr } = await supabase
      .from("employee_campaign_assignments")
      .update({ end_date: dayBefore(effectiveDate) })
      .eq("employee_id", employeeUuid)
      .is("end_date", null)
      .lt("start_date", effectiveDate);
    if (closeErr) throw closeErr;

    // 3b. Open the new assignment.
    const { error: insErr } = await supabase
      .from("employee_campaign_assignments")
      .insert({
        employee_id: employeeUuid,
        campaign_id: newCampaignId,
        start_date: effectiveDate,
        end_date: null,
        reason,
        organization_id: orgId,
      });
    if (insErr) throw insErr;
  }

  // 4. Keep the current-state pointer correct.
  const { error: updErr } = await supabase
    .from("employees")
    .update({ campaign_id: newCampaignId })
    .eq("id", employeeUuid);
  if (updErr) throw updErr;
}

/**
 * Remove an employee from their campaign: close any open assignment as of the
 * effective date (so days worked up to and including that date still bill to
 * the right client) and clear the employees.campaign_id pointer.
 */
export async function removeEmployeeFromCampaign(opts: {
  employeeUuid: string;
  effectiveDate?: string; // defaults to today (local)
}): Promise<void> {
  const { employeeUuid } = opts;
  const effectiveDate = opts.effectiveDate ?? todayLocal();

  // Close open assignments that started on or before the effective date.
  const { error: closeErr } = await supabase
    .from("employee_campaign_assignments")
    .update({ end_date: effectiveDate })
    .eq("employee_id", employeeUuid)
    .is("end_date", null)
    .lte("start_date", effectiveDate);
  if (closeErr) throw closeErr;

  const { error: updErr } = await supabase
    .from("employees")
    .update({ campaign_id: null })
    .eq("id", employeeUuid);
  if (updErr) throw updErr;
}
