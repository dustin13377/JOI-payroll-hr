# Session Handoff

**Saved:** 2026-05-14T21:43:42+00:00
**Machine:** claude (sandbox writer; D committed from his Mac)
**Branch:** main
**Last commit:** 947a7be feat: 30-day reviews + system users + vercel SPA rewrites

## What we were doing

Shipped two features end-to-end: the 30-day probationary review system (i1 + i2) and the system-users concept (i3) for non-employee logins. Migrations applied, edge function deployed, frontend pushed. Waiting on Vercel to finish the deploy so D can test live (emails link to the production URL, not localhost).

## Files in flight

Nothing in flight — working tree is clean. Everything from this session is in commit `947a7be`. Files shipped:

- `supabase/migrations/20260514100001_i1_thirty_day_reviews.sql` — agent_reviews table + RPCs (`complete_agent_review`, `extend_agent_review`, `confirm_review_termination`)
- `supabase/migrations/20260514110001_i2_review_notifications.sql` — dedupe table + helper functions + 2 pg_cron jobs
- `supabase/migrations/20260514120001_i3_system_users.sql` — `is_system_user` boolean on employees + check constraint (admin/owner only)
- `supabase/functions/review-notifications/index.ts` — Deno edge function, 2 modes (`tl_daily` and `escalation`)
- `src/pages/AgentReviews.tsx`, `src/hooks/useAgentReviews.ts`, `src/components/employee-profile/ThirtyDayReviewCard.tsx`
- `src/pages/SystemUsers.tsx` — Owner-only page at `/admin/system-users`
- `vercel.json` — SPA rewrite so `/reviews` and `/admin/system-users` direct links don't 404
- Filters added to `useEmployees`, `usePayrollComputed`, `Campaigns.tsx`, `CampaignDetail.tsx` (3 spots)
- `employees_no_pay` view updated server-side (covers TLDashboard / Attendance / Performance)

## Decisions made this session

- 30-day clock starts from `hire_date` (calendar days), not worked days
- Outcomes: keep / let_go / extend; extension days configurable 1–60
- Let-go is NEVER auto-actioned — TL files recommendation, HR confirms via separate RPC, only then employee flips to `terminated`
- Agents CAN see their own completed reviews (pending let-go is hidden until HR confirms)
- Notifications are email-only (no in-app badges)
- TL gets re-emailed daily until completed; week-4 escalation goes to manager + HR + owner on day-29 evening (6 PM CDMX)
- System users hidden everywhere except `/admin/system-users`; only Owner can manage them; only Admin/Owner roles allowed
- System-user notes reuse `termination_notes` column rather than adding a new column (slightly off-name reuse, flagged for future cleanup if usage grows)

## Open todos

- [ ] **Verify `DRY_RUN_REVIEW=false` in Supabase Edge Functions Secrets** when ready for real review emails to send. Currently defaults to true — function only logs "would send". Path: Project Settings (gear icon) → Edge Functions → Secrets, OR sidebar Edge Functions → "Manage Secrets" button.
- [ ] **Double-check `DRY_RUN_HOLIDAY=false`** while in the Secrets panel (older outstanding item per memory).
- [ ] **Test 30-day reviews live**: set a recent `hire_date` on a test employee, confirm 4 review rows seeded, fill out a Week 1 review, then a Week 4 with let-go to verify the HR confirmation flow.
- [ ] **Test system users live**: as Owner, add a test admin with a different email of yours; verify they're absent from `/empleados`, `/asistencia`, `/desempeno`, payroll. Then test login + remove flow.
- [ ] **Run `graphify update .`** locally to refresh the knowledge graph with the new files.

## Next step when you come back

Wait for the Vercel deploy from commit `947a7be` to finish, then run through the test plan for 30-day reviews first (set a `hire_date` on a test employee → check `/reviews` shows the 4 rows). After that, flip `DRY_RUN_REVIEW=false` in Supabase secrets when you want real review emails to start sending.

## Watch out for

- **Cron jobs are firing already** but in DRY_RUN mode — they hit the live function at 9 AM and 6 PM CDMX every day. Logs will show "[DRY RUN] Would send..." entries. Safe but worth knowing if you're checking edge function logs.
- **`employees_no_pay` view filter is permanent** — system users will not show up there even with `OR id = my_employee_id()`. Not a bug; consequence of the design. If a future system user needs a self-lookup via this view, we'd need to revisit.
- **System-user add flow has a millisecond visibility window** in `/empleados` between `create-employee` returning and the follow-up `is_system_user=true` UPDATE. Acceptable but documented.
- **Pre-existing ESLint `any` errors** in `usePayrollComputed.ts` and `useSupabasePayroll.ts` are NOT from this session — they were already there. Don't try to "fix" them as part of this work.
- **Sandbox can't write through to `.git/index.lock`** — D committed manually from his Mac terminal because the sandbox couldn't run git commit. If you see lock-file errors next session, that's why; D handles git operations.
