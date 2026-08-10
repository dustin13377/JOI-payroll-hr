-- "Date this note is about" for agent_coaching_notes.
-- Decouples the event day from when the note was written (created_at) so the
-- Clock-in History calendar can surface a coaching note on the day it actually
-- refers to. Backfills existing rows to their written date (best available) in
-- MX local time. Idempotent — safe to re-run.
alter table public.agent_coaching_notes
  add column if not exists about_date date;

update public.agent_coaching_notes
  set about_date = (created_at at time zone 'America/Mexico_City')::date
  where about_date is null;
