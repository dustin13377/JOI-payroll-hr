# Spiffs v2 — make spiffs first-class data (plan)

**Decision (2026-06-19):** move spiffs off the Google Sheet into the app. TLs/managers
enter them; D reviews before billing. This kills the two failure modes of the
sheet+importer model:

- **Double-charge:** importer dedups on a hashed signature, not the sheet's INVOICED
  flag, so re-importing re-adds hand-entered history.
- **Dropped spiffs:** two same-day/same-amount spiffs hash to one signature; the 2nd is
  silently lost (e.g. Adrian's PB + 1ST PLACE).

Both vanish once each spiff is a real row with a primary key, and "billed" is a link to
an invoice line instead of a sheet column.

## Data model — new `spiffs` table

| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| organization_id | uuid NOT NULL | default `my_org_id()`, FK organizations (H-2 pattern) |
| employee_id | uuid NOT NULL | FK employees |
| client_id | uuid NOT NULL | which client gets billed |
| spiff_date | date NOT NULL | the day earned |
| amount_usd | numeric NOT NULL | charge to client (CHECK <> 0) |
| amount_mxn | numeric NULL | optional agent-pay record (sheet PESOS col) |
| reason | text NOT NULL | "PB 6", "1ST PLACE", "CP 10", etc. |
| status | text NOT NULL | `pending` → `billed` → (`void`) |
| invoice_line_id | uuid NULL | FK invoice_lines, set when billed (ON DELETE SET NULL) |
| billed_at | timestamptz NULL | |
| created_by | uuid NULL | the TL who entered it |
| source | text NOT NULL | `app` (default) or `sheet_import` (one-time history) |
| created_at | timestamptz NOT NULL | now() |

**Why this fixes it:** two identical spiffs = two rows (no collision). A spiff is billed
by setting `invoice_line_id`; once set it can't attach again (no double-charge). No
signatures, no fuzzy name-matching, no drifting flag.

## Access (RLS)

- Everything scoped `organization_id = my_org_id()`.
- TL: INSERT spiffs for employees on campaigns they lead (`team_lead_campaigns`), SELECT +
  void their own `pending` entries.
- HR/admin: full access.
- A `billed` spiff is locked (no edits/void) — same as an invoiced line.

## Entry UI (TL)

A "Spiffs" screen: pick agent (limited to the TL's campaigns) → date, amount (USD), reason;
client auto-fills from the agent's campaign. Multi-row paste for a whole day/week. Below,
this week's entered spiffs with status, void button on `pending` rows.

## Invoicing

Replace the CSV import path. On generate/finalize for a client+week:
1. find `pending` spiffs for that client's agents dated in the week,
2. sum per agent into `invoice_lines.spiffs` (keep the existing column as the cached sum),
3. set each spiff's `invoice_line_id` + `status = billed` + `billed_at`.

Unlocking an invoice clears the links and sets those spiffs back to `pending`.

## Migration (one-time)

- Import the existing sheet into `spiffs` with `source = 'sheet_import'`.
- Rows already on invoices (wk24 load + historical INVOICED=YES) → `status = billed` so they
  never re-bill; link wk24 ones to their invoice lines where known.
- After import, the sheet is read-only history. `import-spiffs` + `spiff_import_log` are
  retired.

## Phasing (PR-able)

1. **DB** — create `spiffs` table + RLS + indexes (additive). Regenerate types.
2. **TL entry UI** — read/write the table.
3. **Invoicing** — pull & link pending spiffs on generate/finalize; deprecate `import-spiffs`.
4. **Migration** — seed history from the sheet, mark billed, retire sheet.

Heavy/code-intensive → hand to Claude Code in these four focused chunks. Coordinate with
Joe (payroll rework owner) since step 3 touches invoice generation.

See [[project_spiffs_system]], [[project_invoice_generation]].
