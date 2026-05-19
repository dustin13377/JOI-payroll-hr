-- Migration: 20260519000004_payroll_phase1_seed_holidays.sql
-- Phase 1: Seed/backfill mexican_holidays for 2026 (already has dates, missing
--          new columns) and insert 2027 rows (net-new).
--
-- Source: LFT Article 74 (Ley Federal del Trabajo)
-- Confirmed via:
--   expansion.mx/tendencias/2026/04/27/dias-festivos-2026-mexico (2026)
--   mexico.justia.com/blog/calendario-laboral-2026 (2026 calendar)
--   mexico.justia.com/federales/leyes/ley-federal-del-trabajo (Art. 74 text)
--
-- Moving-Monday rules (2006 LFT reform):
--   Día de la Constitución  → first Monday of February  (commemorates Feb 5)
--   Natalicio Benito Juárez → third Monday of March     (commemorates Mar 21)
--   Día de la Revolución    → third Monday of November  (commemorates Nov 20)
--
-- pays_premium = true triggers Art. 75 holiday pay in calcAgentPay_:
--   holidayPay = holidayDays × dailySalary × 2  (the extra 2× premium only;
--   weeklyBase already covers the regular day's pay).
--
-- Dec 1 presidential transition: last was 2024 (Sheinbaum), next is 2030.
-- Not included for 2026 or 2027.
--
-- ON CONFLICT (date) DO UPDATE: fills new columns for existing 2026 rows
-- and inserts the 7 new 2027 rows cleanly.

INSERT INTO public.mexican_holidays (date, name, name_es, name_en, type, pays_premium)
VALUES

  -- =========================================================================
  -- 2026 (dates already exist; this fills name_es / name_en / type / pays_premium)
  -- =========================================================================
  ('2026-01-01',
   'Ano Nuevo',
   'Año Nuevo',
   'New Year''s Day',
   'LFT_OFICIAL', true),

  ('2026-02-02',
   'Dia de la Constitucion',
   'Día de la Constitución',
   'Constitution Day',
   'LFT_OFICIAL', true),
  -- First Monday of February 2026 (Feb 1 = Sunday → Feb 2 = Monday)

  ('2026-03-16',
   'Natalicio de Benito Juarez',
   'Natalicio de Benito Juárez',
   'Benito Juárez''s Birthday',
   'LFT_OFICIAL', true),
  -- Third Monday of March 2026 (Mar 1 = Sunday → 1st Mon = Mar 2 → 3rd Mon = Mar 16)

  ('2026-05-01',
   'Dia del Trabajo',
   'Día del Trabajo',
   'Labor Day',
   'LFT_OFICIAL', true),

  ('2026-09-16',
   'Dia de la Independencia',
   'Día de la Independencia',
   'Independence Day',
   'LFT_OFICIAL', true),

  ('2026-11-16',
   'Dia de la Revolucion',
   'Día de la Revolución',
   'Revolution Day',
   'LFT_OFICIAL', true),
  -- Third Monday of November 2026 (Nov 1 = Sunday → 1st Mon = Nov 2 → 3rd Mon = Nov 16)

  ('2026-12-25',
   'Navidad',
   'Navidad',
   'Christmas Day',
   'LFT_OFICIAL', true),

  -- =========================================================================
  -- 2027 (net-new rows)
  -- =========================================================================
  ('2027-01-01',
   'Año Nuevo',
   'Año Nuevo',
   'New Year''s Day',
   'LFT_OFICIAL', true),

  ('2027-02-01',
   'Día de la Constitución',
   'Día de la Constitución',
   'Constitution Day',
   'LFT_OFICIAL', true),
  -- First Monday of February 2027 (Feb 1 = Monday)

  ('2027-03-15',
   'Natalicio de Benito Juárez',
   'Natalicio de Benito Juárez',
   'Benito Juárez''s Birthday',
   'LFT_OFICIAL', true),
  -- Third Monday of March 2027 (Mar 1 = Monday → 1st Mon = Mar 1 → 3rd Mon = Mar 15)

  ('2027-05-01',
   'Día del Trabajo',
   'Día del Trabajo',
   'Labor Day',
   'LFT_OFICIAL', true),

  ('2027-09-16',
   'Día de la Independencia',
   'Día de la Independencia',
   'Independence Day',
   'LFT_OFICIAL', true),

  ('2027-11-15',
   'Día de la Revolución',
   'Día de la Revolución',
   'Revolution Day',
   'LFT_OFICIAL', true),
  -- Third Monday of November 2027 (Nov 1 = Monday → 1st Mon = Nov 1 → 3rd Mon = Nov 15)

  ('2027-12-25',
   'Navidad',
   'Navidad',
   'Christmas Day',
   'LFT_OFICIAL', true)

ON CONFLICT (date) DO UPDATE SET
  name_es      = EXCLUDED.name_es,
  name_en      = EXCLUDED.name_en,
  type         = EXCLUDED.type,
  pays_premium = EXCLUDED.pays_premium;
-- The existing `name` column is left alone (keeps original value).
-- It's no longer the primary display field; name_es/name_en are used going forward.

-- Acceptance check P1.2 (run after supabase db push):
--   SELECT count(*) FROM mexican_holidays
--   WHERE date BETWEEN '2026-01-01' AND '2026-12-31' AND type = 'LFT_OFICIAL';
--   → Expected: 7
