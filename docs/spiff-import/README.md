# Spiff Push from Google Sheets

One-click push of spiff rows from the master Spiffs Tracker sheet straight
into the app's invoices. Replaces the "download CSV → upload via dialog"
flow for the common case.

## How it works (30-second version)

```
[Spiffs Tracker]  ──► [Apps Script]  ──► [import-spiffs edge fn]  ──► [invoice_lines.spiffs]
       ▲                                                                       │
       └──────── INVOICED=YES + Invoice # + timestamp written back ◄───────────┘
```

- You click **JOI → Push spiffs to app** in the sheet.
- Apps Script walks rows where `INVOICED` is blank/NO and the date is within
  the last 14 days, sends them to a Supabase edge function.
- The edge function fuzzy-matches each row to a draft/sent invoice line
  (same logic as the existing dialog), applies any match scoring ≥ 70,
  logs each application to `spiff_import_log` for idempotency, and bumps
  `invoice_lines.spiffs` by the amount.
- Matched rows get marked `INVOICED=YES` + an `Invoice #` + an `Imported At`
  timestamp back in the sheet.
- Unmatched rows stay `INVOICED=NO` so you can fix the name and re-run.

## Files

| File | Purpose |
| --- | --- |
| `supabase/migrations/20260603120000_spiff_import_log.sql` | Idempotency log table |
| `supabase/functions/import-spiffs/index.ts` | Edge function that does the matching + applies |
| `docs/spiff-import/apps-script/JOI_Spiff_Push.gs` | Apps Script you paste into the sheet |

## One-time setup

### 1. Mint a shared secret

Generate any random string — this is the only thing protecting the endpoint.

```bash
openssl rand -hex 32
```

Copy the value. You'll paste it into two places: Supabase secrets and Apps
Script properties.

### 2. Apply the migration + deploy the edge function

```bash
# from the repo root
supabase db push   # applies spiff_import_log migration
supabase functions deploy import-spiffs
```

### 3. Set the secret in Supabase

Supabase Dashboard → Project Settings → Edge Functions → Manage secrets:

| Key | Value |
| --- | --- |
| `SPIFF_IMPORT_TOKEN` | (the random string from step 1) |

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already provided by
Supabase automatically.)

### 4. Paste the Apps Script into the sheet

1. Open the master Spiffs Tracker Google Sheet.
2. Extensions → Apps Script.
3. Delete the placeholder code, paste the contents of
   `docs/spiff-import/apps-script/JOI_Spiff_Push.gs`.
4. Save (disk icon or ⌘S). Name the project "JOI Spiff Push".

### 5. Set Script Properties

In the Apps Script editor:

1. Project Settings (gear icon, left sidebar) → scroll to **Script Properties**.
2. Add two properties:

| Key | Value |
| --- | --- |
| `SPIFF_IMPORT_URL` | `https://jpaihltkrohdqkqlbqkf.supabase.co/functions/v1/import-spiffs` |
| `SPIFF_IMPORT_TOKEN` | (the random string from step 1 — same value as Supabase) |

### 6. Reload the sheet

Close and reopen the sheet (or refresh the tab). A **JOI** menu shows up
next to Help.

The first time you click it, Google will ask for permission — the script
needs to read/write the sheet and make outbound HTTPS requests.

## Daily use

1. Open the Spiffs Tracker.
2. **JOI → Dry run (preview only)** — see what would be sent without
   applying anything. Optional but useful the first few times.
3. **JOI → Push spiffs to app** — fires for real.
4. Read the popup summary. Anything in "Unmatched" stays `INVOICED=NO`;
   fix the agent name to match what's on the invoice and re-run.

## Failure modes & what to do

| Problem | Fix |
| --- | --- |
| "Setup needed: open File → Project properties…" | Script Properties weren't set. See step 5. |
| "HTTP 401" in the popup | Token mismatch between Supabase and Script Properties. Re-paste both. |
| "no_invoice_for_week" | No draft/sent invoice exists for that row's week yet. Run **Generate Week** in the app, then re-push. |
| "score_too_low" with a hint like "Best guess Javier Aldana only scored 60" | Agent name in the sheet doesn't match the invoice closely enough. Edit the sheet to use the full canonical name and re-run. |
| Network error | Re-run. The edge function is idempotent — rows already applied won't double up. |

## Design notes

### Idempotency

Every applied row writes a `spiff_import_log` entry keyed by:

```
sha256(date | normalized_agent_name | amount.toFixed(2) | normalized_client_hint)
```

If the same row is sent twice — partial failure, double-click, retry after a
crash — the unique index blocks the second insert and the edge function
reports `already_processed` instead of double-applying. The sheet still
gets marked `INVOICED=YES` in that case (the row IS applied, just not by
this run).

### Why incremental, not overwrite

The existing "Upload Spiffs" dialog OVERWRITES `invoice_lines.spiffs` with
whatever's in the CSV. That works for one big upload per week but breaks
incremental pushes from a sheet ("push Monday, push more Wednesday →
Wednesday wipes Monday"). The new edge function INCREMENTS instead, and
the log table provides the safety net so increments don't double-fire.

The old dialog still works the same as before — they're independent code
paths. If you ever do both for the same week, the dialog will clobber the
log-based amount, so pick one workflow per week.

### Threshold

Match score ≥ 70 auto-applies. Lower than that is returned as `score_too_low`
with the best guess listed in the hint, so you can decide whether it's a
real match (and edit the sheet name) or a false positive (leave it).

The existing dialog accepts ≥ 30 because it has a human-in-the-loop
override dropdown. We're stricter here because there's no review step
during the script run.

### 14-day lookback window

Hardcoded at the top of the script (`LOOKBACK_DAYS = 14`). Change it there
if needed. Older rows that are still `INVOICED=NO` will be ignored —
either mark them YES manually or fall back to the dialog for the
straggler.
