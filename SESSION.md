# Session Handoff

**Saved:** 2026-05-21T16:19:26-06:00
**Machine:** Diomedess-Mac-mini
**Branch:** main
**Last commit:** 1113fca Add PAID lock tooltip to payroll week rows

## What we were doing

Reviewed two new payroll math docs Joe sent (`JOI_Payroll_Run_Math_and_Rule_Key_Logic_For_Claude.md` + `JOI_Payroll_Run_Rule_Key_and_Per_Agent_Math_For_Claude.md`) against our current implementation. Confirmed the math is identical to what we already ported (validated 97.03% against Joe's archive). Joe's "Rule Key" system is a Google-Sheets workaround we don't need — our per-employee rates on the `employees` table replace it cleanly. Then audited the "Add Next Week" flow and the PAID lock UX, found one small gap, and shipped a fix.

## Files in flight

- `src/pages/admin/PayrollWeek.tsx` — added a Radix tooltip on the 🔒 lock icon + a native `title` attribute on the row itself so users hovering a PAID row see a clear "locked, ask owner to unlock" message. **Committed and pushed.**

## Decisions made this session

- **Do NOT port Joe's Rule Key system.** Math is identical, but the Rule Key plumbing (string normalization, dropdowns, audit-before-new-week) only exists to prevent Sheets typo bugs that can't happen in our FK-based model. Saved as memory.
- **Phase 4c real scope = 3 must-haves + cleanup.** Order: (1) Re-derive diff dialog, (2) Owner-initiated unlock, (3) CSV export. Everything else is housekeeping that doesn't block payroll go-live. Saved as memory.
- **"Add Next Week" works correctly today** — auto-derives from `time_clock`, blocks if the next week would span past period end, calls `pay_derive_week` which fires the recalc trigger. No changes needed.
- **`pay_redrive_week` DB function already does the smart thing** (preserves manual edits, skips PAID, has preview mode). Only the UI dialog is missing — currently a stub at `PayrollWeek.tsx:766` and `:956`.

## Open todos

- [ ] **Wire the re-derive diff dialog.** ~2-3 hours. Backend already exists. This is the "refresh a week" button D identified in the screenshot.
- [ ] **Build owner-initiated unlock for PAID periods.** ~½ day. High-stakes — today an accidental PAID-lock is unfixable through UI (only SQL).
- [ ] **Build CSV export.** ~2-4 hours. Needed for parallel run with Joe's sheet.
- [ ] _(cleanup, not blocking)_ Delete `src/pages/PayrollRun.tsx`, `src/hooks/useSupabasePayroll.ts`; clean up placeholder cells in `Dashboard.tsx`, `Empleados.tsx`, `Historial.tsx`.

## Next step when you come back

Start with the re-derive diff dialog. Open `src/pages/admin/PayrollWeek.tsx` around line 766 (the stub button) and line 956 (the stub dialog). Replace with a real dialog that:
1. Calls `supabase.rpc('pay_redrive_week', { p_week_id, p_confirm: false })` to get the diff preview
2. Renders the per-record diff (changes + preserved manual overrides) in a table
3. On confirm, calls the RPC again with `p_confirm: true` and shows a result toast

The function signature and return shape are in `supabase/migrations/20260520000001_payroll_phase3_auto_derive.sql` starting at line 409.

## Watch out for

- **No git push from this sandbox.** Claude can't push from Cowork — all commits/pushes happen on D's terminal. Standard rule.
- **PAID lock tooltip is live but I didn't include the locked-on date** in the message. Doing that cleanly means querying the period's `locked_at` and threading it down. Easy follow-up if D wants it, but not blocking.
- **The legacy `/payroll-run` route still resolves by URL** even though there's no nav entry pointing at it. Slated for cleanup in 4c.
- **Joe's 13 documented divergences (97.03% validation)** are still parked — Aldo/Albert Sunday premium, Jorge flat $400/day deduction, Glenn/Cesar ad-hoc payments. Not blocking, but D may want to clarify with Joe before parallel run starts.
