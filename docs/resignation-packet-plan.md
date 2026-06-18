# Feature F — Resignation Packet (Renuncia + Finiquito + Encuesta de Salida)

Queued 2026-04-23. Voluntary-resignation-only. Extends the carta/acta infrastructure with a third document type that bundles three documents into one signed packet.

## What's in the packet

The packet is a single PDF containing three documents, printed as one, signed once by the employee, scanned back in one pass:

1. **Renuncia** (page 1) — short resignation letter. First-person from the employee. Date + company + position + effective date + brief thank-you language. Signature line.
2. **Finiquito** (page 2) — final settlement with itemized LFT math: aguinaldo proporcional, vacaciones correspondientes, prima vacacional, total. Plus total-as-words ("cantidad con letra"). Plus CURP, RFC, Clave de Elector. Plus physical fingerprint capture squares (paper only).
3. **Encuesta de Salida** (pages 3–4) — blank paper survey for the employee to fill with pen. Likert satisfaction table (6 categories × ~20 questions), four open-ended questions, causa-de-baja checkbox list.

Reference template: `docs/reference/resignation-packet-template.pdf`. Reference sample: Edgar Martín Barrón Villalobos, Transfer Agent, resignation effective 2026-03-18.

## Design calls locked 2026-04-23

- **Initiator:** TL or HR, same pattern as carta/acta. New `request_type = 'renuncia'` on `hr_document_requests`.
- **Scope:** Voluntary resignation only. Termination letters would be a separate feature.

> **Update 2026-06-18 — Encuesta now rides every baja.** The Encuesta de Salida is no longer renuncia-only. The survey renderer was extracted to `src/lib/pdf/drawEncuesta.ts` (single source of truth) and is now appended to both termination documents as well: `rescision_prueba` (`generateRescisionPdf`) and `rescision_desempeno` (`generateRescisionDesempenoPdf`). It renders on its own page after the signature section. Renuncia output is unchanged. Open follow-up: the survey intro reads "lamentamos su renuncia," which is awkward on an involuntary termination — left as-is per request, flag for a future copy tweak.
- **Finiquito math:** App auto-calculates per LFT; HR can override any line item. Default values appear pre-filled, HR can edit before saving the draft.
- **Encuesta de Salida:** Paper only for v1. PDF generates the blank survey as pages 3–4; employee fills with pen; HR scans the completed packet back. No digital form UI, no response tracking in DB. If HR wants trend reporting later, upgrade to a digital form as a followup.

## LFT calculation formulas

The auto-suggest numbers HR sees in the editor come from these formulas. Encode in `src/lib/lftCalculations.ts` with unit tests — legal math doesn't get "eyeballed OK" into prod.

### Aguinaldo proporcional (LFT Art. 87)

Annual minimum is 15 days of salary. Proportional to days worked in the current calendar year.

```
aguinaldo = 15 × salario_diario × (días_trabajados_en_año / 365)
```

Where `días_trabajados_en_año` = days from Jan 1 (or hire date if later) to resignation date, inclusive.

**Sanity check against template example:** Edgar hired pre-2026, resigns 2026-03-18. Days in 2026 = Jan 1 → March 18 = 77. `15 × 600 × (77/365) = 1,898.63` ✓ (matches template).

### Vacaciones correspondientes (LFT Art. 76, post-2023 reform)

Entitled days by tenure year:

| Year of tenure | Entitled days |
|---|---|
| 1 | 12 |
| 2 | 14 |
| 3 | 16 |
| 4 | 18 |
| 5 | 20 |
| 6–10 | 22 |
| 11–15 | 24 |
| 16–20 | 26 |
| 21–25 | 28 |
| 26–30 | 30 |
| 31+ | +2 every additional 5 years |

Amount when resigning mid-year:

```
vacation_days_earned = entitled_days_for_current_tenure_year × (días_desde_último_aniversario / 365)
vacaciones_monto = vacation_days_earned × salario_diario
```

For employees in their first year (who haven't reached their first anniversary), `días_desde_último_aniversario` = `días_desde_ingreso`.

**Sanity check:** Edgar hired 2025-06-09, resigns 2026-03-18. Days since hire = 283. Year 1 entitlement = 12 days. `12 × (283/365) × 600 = 5,582.47` ✓ (matches template).

### Prima vacacional (LFT Art. 80)

```
prima_vacacional = vacaciones_monto × 0.25
```

**Sanity check:** `5,582.47 × 0.25 = 1,395.62` ✓ (matches template).

### Total + number-to-Spanish-words

```
total = aguinaldo + vacaciones + prima_vacacional
total_en_letras = numberToSpanishWords(total)   // "OCHO MIL OCHOCIENTOS SETENTA Y SEIS PESOS CON SETENTA Y DOS CENTAVOS 72/100 M.N."
```

Implement `numberToSpanishWords` as a small utility. Use an npm lib (`number-to-words-es` or similar) or roll a compact implementation. Must match MX convention for the "72/100 M.N." centavo suffix and uppercase PESOS formatting.

### Edge cases to handle

- Employee hired after Jan 1 of the resignation year: aguinaldo cap at days-since-hire, not full calendar proportion.
- Employee resigns exactly on hire anniversary: treat as completing the tenure year, use the next-year entitlement.
- Leap years: use 365 flat for simplicity, or 366 during leap years and document the choice.
- Salary changes mid-year: the template uses current `salario_diario`; don't attempt prorated historical salary.

## Data model sketch (Phase F1)

New finalization table `resignation_packets`:

```
id                           uuid PK
employee_id                  uuid NOT NULL → employees(id)
request_id                   uuid → hr_document_requests(id) (nullable, like cartas/actas)
doc_ref                      text UNIQUE (format: RN{YYYYMMDD}-{HHMM})

-- Snapshot fields (reused pattern from cartas/actas)
trabajador_name_snapshot     text
puesto_snapshot              text
horario_snapshot             text
company_legal_name_snapshot  text
company_legal_address_snapshot text

-- Renuncia-specific
effective_date               date NOT NULL       -- last day of work
renuncia_narrative           text                -- optional custom language

-- Finiquito-specific (all frozen at generation time)
hire_date_snapshot           date
salario_diario_snapshot      numeric(12,2)
aguinaldo_monto              numeric(12,2)
vacaciones_monto             numeric(12,2)
prima_vacacional_monto       numeric(12,2)
total_monto                  numeric(12,2)
total_en_letras              text
curp_snapshot                text
rfc_snapshot                 text
clave_elector                text                -- NOT on employees; HR enters at finiquito time

-- Signing (reuses carta/acta pattern)
pdf_path                     text
signed_at                    timestamptz
signed_scan_path             text

created_by                   uuid NOT NULL → employees(id)
created_at                   timestamptz NOT NULL DEFAULT now()
updated_at                   timestamptz NOT NULL DEFAULT now()

CHECK ((signed_at IS NULL) = (signed_scan_path IS NULL))
```

Plus:
- Extend `hr_document_requests.request_type` CHECK to add `'renuncia'`.
- Add `fulfilled_renuncia_id uuid → resignation_packets(id)` on `hr_document_requests`. CHECK updated to ensure at-most-one fulfilled link.
- RLS: same tiers as cartas/actas — leadership ALL, TL read team-scoped, agent read own signed only.
- `hr_create_finalization_draft` RPC extended to handle `'renuncia'` type.
- `hr_mark_finalization_signed` RPC extended to handle `'renuncia'` type.

## Phase plan

Two phases.

### Phase F1 — Data model + LFT calculation engine ✅ SHIPPED 2026-04-23 (PR #51)

Schema-only + pure math. No UI.

- Migration `20260423100001`: `resignation_packets` table + FK + RLS + CHECK updates on requests table. Both RPCs extended for `'renuncia'` type.
- `src/lib/lftCalculations.ts` — pure functions for aguinaldo/vacaciones/prima/total + `numberToSpanishWords` (MX peso format).
- 28 unit tests including Edgar Barron template sanity check (all 3 financial figures match to 2 decimals). Uses 365 days uniformly (no leap-year adjustment). Resignation date counted as a worked day (inclusive both ends).
- Supabase types regen deferred to post-migration-apply.

### Phase F2 — PDF renderer + editor UI ✅ SHIPPED 2026-04-23 (PR #52)

- `src/lib/pdf/generateRenunciaPacketPdf.ts` — 4-page PDF: renuncia letter + finiquito with LFT itemized table + 2-page encuesta de salida (Likert + open questions + causa checkboxes).
- `src/lib/documentTemplates.ts` extended with renuncia/finiquito/encuesta boilerplate + full encuesta question catalog (6 categories, 23 questions, 4 open questions, 11 causa options).
- Editor right-panel: effective date picker, finiquito auto-calculator ("Calcular automáticamente" button calls F1 LFT engine), 4 amount fields (HR-overridable), total-en-letras textarea, CURP/RFC readonly + clave de elector input.
- TL request dialog: third radio option "Renuncia voluntaria" with "Solicitar renuncia" button.
- HR queue + detail + TL card: renuncia badges (secondary variant), fulfilled doc links extended.
- All existing B2/B3 infrastructure (PDF gen, signed-scan, signed-URL edge function, agent signed-docs card) extended for 'renuncia' type.
- Types extended: `HrDocumentRequestType`, `FinalizationDraft`, `DraftUpdateFields`, `SignedHrDocument`, `HrDocumentRequestRow` all include renuncia fields/variants.

## Followups beyond F2

- Digital encuesta de salida form (replace paper) + structured response tracking + HR reporting dashboard across historical exit surveys.
- `clave_elector` as a field on `employees` if it's used in multiple places beyond finiquito.
- Termination letters (involuntary separation) as a fourth doc type if/when HR needs that flow.
- Finiquito calculation audit log — when HR overrides auto-computed values, capture the overridden-vs-suggested pair for legal trail.

## Related memory

- `project_hr_backlog.md` — HR feature status.
- `project_feature_e_client_portal.md` — still queued, independent of this feature.
- `project_joi_payroll.md` — RLS + migration-apply workflow.
