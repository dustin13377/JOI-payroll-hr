-- Add per-client flag controlling whether approved paid vacation days count
-- as billable days in invoice generation.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bill_vacation boolean NOT NULL DEFAULT false;

-- Torro billets vacation days. Update by name — verify spelling in production
-- before or after applying this migration.
UPDATE public.clients
  SET bill_vacation = true
  WHERE name ILIKE '%torro%';

COMMENT ON COLUMN public.clients.bill_vacation IS
  'When true, approved paid vacation days (vacation_requests.is_paid=true, status=approved)
   overlapping the invoice week are added to days_worked for per-day-billed lines.
   Days already covered by a time_clock punch are not double-counted.';
