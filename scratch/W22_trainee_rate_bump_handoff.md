# W22 Trainee Rate Bump — Handoff Report

**Generated:** 2026-06-01 by scheduled task `bump-trainee-rates-w22`
**Status:** ⚠️ Not executed — needs D to run SQL manually

## Why not executed automatically

This session's Supabase MCP only has access to `sandoval028-ctrl` and `peptide-protocol` orgs. The JOI project (`jpaihltkrohdqkqlbqkf`) is not reachable, so I couldn't verify or bump the rates from here.

## The three trainees

| Code | Name | UUID |
|---|---|---|
| EMP-102 | Angeles Elisa Vázquez Ramírez | `d21cdfbb-aa15-42ee-be08-6ea32b387591` |
| EMP-0121 | José Andrés Hernández Arroyo | `d086d882-ceae-4609-973a-33649f595c60` |
| EMP-0124 | Luis Fernando Reyes Flores | `0cf36c6f-c448-4719-8c58-fab07fcb926e` |

## Step 1 — Verify before bumping

Run this on JOI Supabase to confirm they're still SLOC Weekday + worked ~4 days in W22 (5/25–5/31):

```sql
SELECT
  e.employee_id,
  e.full_name,
  e.daily_bill_rate,
  e.campaign_id,
  c.name AS campaign_name,
  (SELECT COUNT(*) FROM time_clock tc
     WHERE tc.employee_id = e.employee_id
       AND tc.date BETWEEN '2026-05-25' AND '2026-05-31') AS w22_days_worked
FROM employees e
LEFT JOIN campaigns c ON c.id = e.campaign_id
WHERE e.id IN (
  'd21cdfbb-aa15-42ee-be08-6ea32b387591',
  'd086d882-ceae-4609-973a-33649f595c60',
  '0cf36c6f-c448-4719-8c58-fab07fcb926e'
);
```

**Expect:** `campaign_name = 'SLOC Weekday'` (or whatever its canonical name is) and `w22_days_worked` close to 4 for each row. If anyone shows 3 days or 5 days or a different campaign, hold off on bumping that row and ping me.

## Step 2 — Bump the rate

If verification looks clean:

```sql
UPDATE employees
SET daily_bill_rate = 100
WHERE id IN (
  'd21cdfbb-aa15-42ee-be08-6ea32b387591',
  'd086d882-ceae-4609-973a-33649f595c60',
  '0cf36c6f-c448-4719-8c58-fab07fcb926e'
);
```

`UPDATE` isn't destructive, so no hard-rule approval gate — but verify first per the task's own caveat.

## Or use the UI

Open `/facturas/nueva` for W22 on the JOI app, find each in the Torro section, type `100` in the Rate column inline editor, hit Enter. Persists to `employees.daily_bill_rate` automatically.

## What to check after

W22 invoice line for each should show `4 days × $100 = $400` instead of `4 × $80 = $320`. If the invoice was already generated for W22, regenerate or edit the line in FacturaDetalle.
