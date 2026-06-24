-- Loosen the short-break late-return prompt to 30 seconds past the cap.
-- break_grace_minutes was integer (whole minutes only). Widen to numeric so it
-- can hold 0.5 (= 30 seconds). The Timeclock comparison already uses fractional
-- minutes: needs-reason = elapsedMin > capMin + break_grace_minutes.
ALTER TABLE public.shift_settings
  ALTER COLUMN break_grace_minutes TYPE numeric USING break_grace_minutes::numeric;

ALTER TABLE public.shift_settings
  ALTER COLUMN break_grace_minutes SET DEFAULT 0.5;

-- Apply the 30-second grace to every existing campaign.
UPDATE public.shift_settings SET break_grace_minutes = 0.5;
