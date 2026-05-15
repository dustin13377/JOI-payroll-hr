# Session Handoff

**Saved:** 2026-05-14T23:45:42+00:00
**Machine:** cowork-sandbox (claude)
**Branch:** main
**Last commit:** cd2d1cf session-handoff: patched create-employee for idempotency, untested

## What we were doing

Continued debugging the Add Employee form after the previous handoff. The idempotency patch (v23/v24, GH Actions auto-deployed when you pushed) cleared the ghost-auth-user case, but the form was *still* 400ing. Pulled the actual error from your DevTools Network tab and found **two new problems**: (1) Supabase Auth's email rate limit is exceeded after all the failed retries today, and (2) the `employees` table has a NOT NULL `organization_id` column the edge function never populates — so even once the rate limit clears, the insert would fail.

You picked Option 3 (custom SMTP via Google Workspace using `humanresources@justoutsource.it`) to fix both the rate limit AND make invite emails look professional. You're currently in the middle of setting up the App Password + Supabase SMTP config. I have NOT yet patched the `organization_id` bug — that's the next thing to do once SMTP is live.

## Files in flight

- `supabase/functions/create-employee/index.ts` — currently deployed as v24 (GH Actions deploy from main). Idempotency patch is live. **Still needs another patch:** look up the caller's `organization_id` from their `user_profiles.employee_id → employees.organization_id` chain, and include it in the new employee `INSERT`. Without this, the insert hits a NOT NULL violation.

## Decisions made this session

- Going with **Option 3 — custom SMTP via Google Workspace**, not waiting out the rate limit or using `generateLink`. Sender will be `humanresources@justoutsource.it` for an on-brand look.
- `organization_id` for new employees will be pulled from the **caller's** employee record (via `user_profiles → employees.organization_id`), not hardcoded. Keeps the function multi-tenant-friendly even though JOI is single-org today.
- The Postgres "column reference 'employee_id' is ambiguous" error I saw earlier in the logs was a red herring — happened in a different code path, not Joe's flow. Did not pursue further.
- **D already has an App Password for `EOD@justoutsource.it`** (stored as `GMAIL_USER` + `GMAIL_APP_PASSWORD` Supabase secrets, used by `send-eod-digest`, `compliance-notifications`, `review-notifications`). Considered reusing it for Auth SMTP (30-sec setup) but rejected — "EOD" reads weird as the From address on a new-hire invite. Sticking with the plan to make a fresh App Password for `humanresources@`.

## Open todos

- [ ] **D Step 1:** Generate Google App Password for `humanresources@justoutsource.it` (requires 2FA on that account). https://myaccount.google.com/apppasswords — label it "Supabase Auth", copy the 16-char password.
- [ ] **D Step 2:** Supabase dashboard → Project Settings → Authentication → SMTP Settings → Enable Custom SMTP. Host `smtp.gmail.com`, port `587`, sender `humanresources@justoutsource.it`, sender name `JOI Human Resources`, username = sender email, password = App Password (no spaces). Save.
- [ ] **D Step 2.5 (optional):** Customize the Invite User email template under Authentication → Email Templates for JOI branding.
- [ ] **Claude Step 3:** Patch `supabase/functions/create-employee/index.ts` to fetch caller's `organization_id` and set it on BOTH the `employees` insert AND the `user_profiles` insert (not just one). Deploy.
- [ ] **D Step 4:** Test the Add Employee form again with `joe.renteria@torro.com` (different person — the one that errored on the System Users page tonight) to confirm the end-to-end flow works for client-side hires.
- [ ] **Frontend tweak:** Make the UI render `"JOI"` instead of `None`/blank as the client label for any employee where `title ∈ (manager, admin, owner)` and `campaign_id is null`. Touches Empleados table, employee profile card, edit form. See `project_joi_internal_staff_display` memory note.

## Next step when you come back

Knock out the Google App Password for `humanresources@justoutsource.it` first (turn on 2FA if needed, generate App Password at https://myaccount.google.com/apppasswords). Then plug into Supabase Auth → SMTP Settings (`smtp.gmail.com:587`). Ping Claude when SMTP is live, Claude patches the `organization_id` bug, you retry the Add Employee form for Joe Renteria.

## Watch out for

- **Joe IS in the DB now** as `joe.renteria@justoutsource.it` with title=manager, JOI-0108, password `test123!`. Created via direct SQL (DO block) bypassing the broken edge function. Email pre-confirmed so he can log in immediately. Tell Joe to change password on first login.
- **Two NOT NULL `organization_id` columns, not one.** When we patch `create-employee` tomorrow, it needs to set `organization_id` on BOTH `employees` AND `user_profiles` inserts. First retry hit the user_profiles constraint after I'd only added org_id to employees.
- **The org_id patch is not yet written.** Even after SMTP is configured, the form will fail with a NOT NULL violation until Claude lands the patch.
- **v24 has `verify_jwt: true`** (set by GH Actions defaults). Versions 22-23 had it `false`. The function still handles its own auth via the Authorization header, so this works for the React app, but worth knowing if you ever invoke it from a tool that doesn't send a JWT.
- **Custom SMTP setup will burn ~10-15 min of your time.** Google App Password requires 2FA on the humanresources account first if it's not already on.
- **DRY_RUN_HOLIDAY check** — still on the open list from a prior session (verify the value and flip it to "false" so PTO emails actually send). Not related to this issue, but mentioning so it doesn't get lost.
