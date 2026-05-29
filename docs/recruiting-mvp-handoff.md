# Recruiting Module — MVP Handoff

**Shipped:** 2026-05-29 (end-to-end verified with a live form submission)
**Branch:** merged from `feature/recruiting-mvp` to `main`
**Sidebar entry:** Recruiting (Leadership only) → `/recruiting`

## What it does

Captures applicants from the JOI WordPress hiring form into a structured pipeline. Leadership sees every new application within seconds of submission, can triage and move candidates through pipeline stages (New → Triaged → Interview Scheduled → Interviewed → Warm Hold → Reactivated → Hired/Passed/Withdrew/Ghosted), and maintains a warm bench of vetted candidates for rolling hires.

## What it does NOT do (yet)

These are V1 features, deliberately out of MVP scope:
- Outbound messaging from the app (no composer, no templated WhatsApp/email send)
- Interview notes UI (the `recruiting_interviews` table exists; no page for it yet)
- Bench keep-alive queue / automated follow-up reminders
- Reactivation flow (bulk-select bench, ping about a specific opening)
- Dashboard widgets (Action Needed, Decisions Owed, Waiting on Reply)
- Auto-acknowledge email to applicants (see "How the silence-killer actually works" below — the form doesn't capture an applicant email address, so this was dropped)
- Candidate → employee handoff (graduating a hired candidate into `empleados`)

## Architecture

```
WordPress hiring form
  → email to humanresources@justoutsource.it
  → Gmail filter forwards matching messages to Postmark Inbound address
  → Postmark POSTs JSON to Edge Function `inbound-application`
  → Function verifies secret, parses HTML body, dedups by CURP,
    inserts (or updates existing) row in recruiting_candidates
  → Leadership sees the row in /recruiting within ~30 seconds
```

## How the silence-killer actually works

The original design called for an automated acknowledgment email. We discovered during build that **the WordPress form does not capture an applicant email address** — only WhatsApp number, name, CURP, role of interest, English level, and a few free-text fields.

That meant we couldn't send an automated email. Instead, the silence-killer is:

1. **Real-time visibility** — every form submission appears in `/recruiting` within ~30 seconds (limited by Postmark's webhook latency)
2. **Human first-touch within hours** — recruiter sees the new row, opens the drawer, copies the WhatsApp number, sends a personal message manually
3. **V1 will add a 1-click WhatsApp button** — open WhatsApp Web with a pre-filled templated greeting; for now it's manual

This is actually closer to what the form contract promises (applicant filled in WhatsApp expecting WhatsApp contact — getting a quick personal WhatsApp message is more on-brand than an automated email).

## Operations

### Setup state (one-time, mostly external)

| Item | Where | Notes |
|---|---|---|
| Supabase project | `jpaihltkrohdqkqlbqkf` | Shared with the rest of the JOI HR app |
| Postmark account | `JOIHR` username, login at account.postmarkapp.com | One server, free tier (1k/mo) |
| Postmark inbound address | `6b3f24694de13aca5152d4a02e5657a9@inbound.postmarkapp.com` | Stable for this server |
| Postmark inbound webhook URL | `https://jpaihltkrohdqkqlbqkf.supabase.co/functions/v1/inbound-application?secret=<POSTMARK_INBOUND_SECRET>` | Configured in Postmark server's Inbound Stream settings |
| Gmail filter | In `humanresources@justoutsource.it` Gmail | "From: mail@justoutsource.it" → Apply label "Applicants" + Forward to Postmark inbound address |
| Edge Function secret | `POSTMARK_INBOUND_SECRET` in Supabase secrets | 64-char hex value, also mirrored in macOS Keychain (`security find-generic-password -a apex -s POSTMARK_INBOUND_SECRET -w`) |
| Backlog | 13 historical applications in HR's inbox labeled "Applicants" but NOT forwarded to Postmark | Gmail does not replay forwarding retroactively. Use `scripts/backfill-recruiting-candidates.ts` if you want them in the pipeline. |

### Secrets

Recruiter laptops should store credentials in macOS Keychain per the project-wide protocol:
```bash
security add-generic-password -a "apex" -s "POSTMARK_INBOUND_SECRET" -w "<value>"
```
Never commit secrets to the repo, never paste them in chat or PRs.

### Common issues

- **No new candidates appearing after a form submission**
  1. Check Postmark Activity log — was the email received and forwarded to the webhook?
  2. Check Supabase Function Logs for `inbound-application` — `supabase functions logs inbound-application` (or via the dashboard)
  3. Check the Gmail filter is enabled and matching the WP form's sender address

- **Parser failures (row has `needs_manual_review = true`)**
  1. Open the candidate's drawer, expand "Raw email body"
  2. Identify what the parser couldn't extract (usually a form field renamed or added)
  3. Update `supabase/functions/inbound-application/parser.ts` and add a test against the new fixture
  4. Re-deploy: `supabase functions deploy inbound-application --no-verify-jwt`

- **Duplicate candidates from the same person**
  - Dedup is keyed on CURP. If a person re-applies with the same CURP, the existing row is updated (not duplicated) — pipeline stage, assignment, and outcome are preserved
  - If they re-apply with NO CURP (and they had no CURP before), a duplicate WILL be created — manually merge in the dashboard
  - If they re-apply with the SAME phone but no CURP, the backfill script catches this (during backfill only — runtime webhook does NOT dedup by phone)

### Backfilling existing Gmail applicants

```bash
cd "/Users/admin/Desktop/JOI/JOI Payroll and HR app"
SUPABASE_URL=https://jpaihltkrohdqkqlbqkf.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=$(security find-generic-password -a apex -s SUPABASE_SERVICE_ROLE_KEY -w) \
  npx tsx scripts/backfill-recruiting-candidates.ts ~/Desktop/joi-backlog.csv
```

CSV format (header row required):
```
full_name,curp,phone,email,role_interest,english_level_self,applied_at,applicant_notes
```

Only `full_name` is required. Idempotent — re-runs skip rows whose CURP (or phone, when CURP is blank) already exists in the DB.

## Tables

All prefixed `recruiting_*`. Zero foreign keys to existing app tables. Only cross-system reference is `assigned_to → auth.users.id`.

| Table | Purpose | Status in MVP |
|---|---|---|
| `recruiting_candidates` | Core pipeline record | Used heavily |
| `recruiting_messages` | Outbound + inbound message log | Created, not yet written to (V1 composer will populate it) |
| `recruiting_interviews` | Interview notes + scoring | Created, no UI yet (V1) |

## File map

```
supabase/migrations/20260527000001_recruiting_tables.sql        Initial 3 tables + RLS
supabase/migrations/20260527000002_recruiting_fixups.sql        SECURITY DEFINER + 'received' status
supabase/migrations/20260528000001_recruiting_curp.sql          CURP column + unique partial index
supabase/functions/inbound-application/
  ├── deno.json
  ├── index.ts                                                  Webhook handler
  ├── parser.ts                                                 Pure HTML-to-fields parser
  ├── __fixtures__/sample-email.txt                             Real form submission for tests
  └── __tests__/parser.test.ts                                  17 tests, deno test
src/
  pages/Recruiting.tsx                                          List + filter + drawer host
  components/recruiting/
    ├── CandidateTable.tsx
    ├── CandidateDrawer.tsx
    ├── StageBadge.tsx
    └── StageSelector.tsx                                       With terminal-stage confirmation
  hooks/useRecruiting.ts                                        useCandidates / useCandidate / useUpdateCandidate
  lib/recruiting/
    ├── stages.ts                                               State machine helper
    └── stages.test.ts                                          7 tests, vitest
  components/AppSidebar.tsx                                     +1 entry in leadershipItems
  App.tsx                                                       +1 route registration
scripts/backfill-recruiting-candidates.ts                       CSV → DB importer
```

## V1 priorities (write the V1 plan AFTER ~1 week of MVP use)

Use the MVP for real for a week. The acute friction will tell you what to build first. Likely candidates (no order):
- 1-click templated WhatsApp button on candidate rows (closes the silence-killer gap)
- Interview notes UI on the candidate drawer
- "Bench Keep-Alive Queue" view — `next_followup_at` past due
- Dashboard widgets (Action Needed, Decisions Owed, Waiting on Reply)
- Reactivation flow (bulk-select + bulk send)
- Candidate → employee handoff to `empleados`
