-- Mandatory breaks + late-return reasons
-- 1) Capture a reason when an employee ends a break over its cap (+ grace).
-- 2) Per-campaign grace before a late return requires a reason (default 0 = any minute over).

alter table public.time_clock
  add column if not exists lunch_late_reason text,
  add column if not exists break1_late_reason text,
  add column if not exists break2_late_reason text;

comment on column public.time_clock.lunch_late_reason is 'Reason the employee gave for ending lunch over the 60-min cap (+ grace). Null = on time.';
comment on column public.time_clock.break1_late_reason is 'Reason the employee gave for ending break 1 over the 15-min cap (+ grace). Null = on time.';
comment on column public.time_clock.break2_late_reason is 'Reason the employee gave for ending break 2 over the 15-min cap (+ grace). Null = on time.';

alter table public.shift_settings
  add column if not exists break_grace_minutes int not null default 0;

comment on column public.shift_settings.break_grace_minutes is 'Minutes an employee may exceed a break cap before a late-return reason is required. 0 = any minute over.';
