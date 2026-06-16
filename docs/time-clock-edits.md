# Time-clock edits (missing / corrected punches)

How HR, managers, and team leads add or correct an agent's `time_clock` row
(the "Add missing punch" / "Edit punch" dialog).

## Where it lives

- **UI:** `src/components/EditPunchDialog.tsx`
- **Hook:** `useEditTimeClock` in `src/hooks/useSupabasePayroll.ts`
- **Edge function:** `supabase/functions/edit-time-clock/index.ts`
- **Audit table:** `time_clock_audit` (every edit recorded: `edited_by`, `action`,
  `before_state`, `after_state`, `reason`)

## Auth model

The edge function decides who may edit whom:

- **owner / admin / manager** — can edit any employee **in their own org**.
- **team_lead** — can edit any agent **in their own org**.
- **Cross-org edits are always blocked**, regardless of role.
- A non-empty `reason` (min 3 chars) is **required** on every edit and is stored
  in the audit log.

The only scope guard is the same-organization check. There is no per-campaign
restriction.

## Change log

### 2026-06-16 — Removed per-campaign restriction for team leads

**What changed:** Team leads can now edit punches for any agent in their org, not
just agents on the same `campaign_id`.

**Why:** Deysi (TL on *SLOC Weekend*) couldn't add a missing punch for Damian
Ortega Vargas (agent on *SLOC Weekday*). The function returned 403
*"TLs can only edit punches for their own campaign."* The *SLOC Weekday* campaign
has no team lead assigned, so its agents had no TL who could fix their punches.
D decided TLs should be able to edit any agent in the org.

**Trade-off / risk:** A TL can now alter attendance for agents they don't
directly manage. This is mitigated by the audit trail — every edit records who
made it, the before/after state, and a required reason. If finer-grained control
is wanted later, the cleaner approach is multi-campaign TL assignment (let a TL
cover several named campaigns) rather than all-org access.

**Also fixed in the same change:** the app previously swallowed the function's
real error and showed the cryptic *"Edge Function returned a non-2xx status
code"* toast. The shared helper `edgeErrorMessage()` (in `src/lib/edge.ts`) now
unwraps `error.context` (the `FunctionsHttpError` body) so users see the actual
reason, e.g. *"reason is required (min 3 chars)"* or *"Cross-org edit blocked."*

This helper is applied to **every** `supabase.functions.invoke` call in the app
(11 sites across `useSupabasePayroll`, `useHrDocumentRequests`, `SystemUsers`,
`HrTimeOff`, `ProvisionOrg`, `CampaignDetail`, `EmpleadoPerfil`, and
`SubmitEODForAgentDialog`). Use it for any new edge-function call too.
