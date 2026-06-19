# Ops note — 2026-06-19: Week-24 spiffs load + old-app timeclock reconciliation

## 1. Time clock: old clock-in app vs JOI (week Jun 8–14)

Compared the team's old clock-in app export (`TimeSheetStandard.csv`) against JOI `time_clock`.

- JOI is the **more complete** source this week: 168 employee-days vs 122 in the old app.
- Only **3 employee-days** exist in the old app but not JOI:
  - Luis Angel Martinez Gonzalez — Jun 08 (old net 8.07h) — clean gap, safe to add.
  - Mariana Perez — Jun 11 & Jun 13 — **conflict, not a gap.** Old app says she worked Tue/Thu/Sat; JOI says Mon/Tue/Wed. Only Jun 09 overlaps. Needs TL confirmation before either system is edited.
- Old app has **8 broken `24:00` rows** (In == Out, missed clock-outs) that inflate its totals — ignore/fix at source.
- Systematic ~1.5h gap on many matched days: old app deducts unpaid breaks from net hours; JOI `total_hours` does not. Payroll-logic decision, not a data error.

Backfill of Luis's Jun 08 row is **pending** D confirmation.

## 2. Week-24 spiffs loaded onto draft invoices (Jun 8–14)

Source: `SPIFFS TRACKER ALL CAMPS - SPIFFS.csv`. Loaded only the Jun 8–14 rows onto the
freshly-generated draft invoices (TORRO-24 / SCOOP-22 / HFB-02).

| Client | Spiffs loaded | Agents |
|---|---|---|
| Torro | $858.99 | 10 |
| Scoop | $272.99 | 3 |
| HFB Tech | $55.89 | 1 |
| **Total** | **$1,187.87** | **14** |

Method: replicated the `import-spiffs` edge function logic via SQL — added each agent's
spiffs onto their existing day-rate line, recomputed `total`/`total_price`, and wrote
dedup signatures into `spiff_import_log` (source = `cowork_backfill`, 42 rows) so a future
full-sheet import won't double-add these. Invoices left in **draft** for review.

## 3. ⚠️ Bugs found — recommend follow-up fixes

**a) `import-spiffs` dedup signature collides on same-day, same-amount spiffs.**
The signature is `sha256(date | agent | amount | client)` — no spiff *reason*. Adrian
Castillo earned two distinct $17.65 spiffs on the same days (a "PB" and a "1ST PLACE");
the importer would collapse them and **under-bill by $52.95** ($105.90 → $52.95). The
manual load above applied the correct $105.90. Fix: include a row identifier / reason in
the signature.

**b) The sheet's `INVOICED TO CLIENT` flags are out of sync with the app.**
All Jun rows are marked `NO`, but week-23's spiffs were already on sent invoices. The
importer dedups on `spiff_import_log` signatures, not the sheet flags — so re-uploading
the whole sheet would re-add every manually-entered historical spiff. This is the
double-charge risk that prompted this manual load. Fix before any bulk re-import:
backfill `spiff_import_log` for already-billed history, or have the importer reconcile
against existing `invoice_lines.spiffs`.

Older un-invoiced "back days" (April–wk23, ~$1.9k in the sheet) were **left untouched** —
spot-checks show wk23 is already billed.
