-- =============================================================================
-- generate_seed.sql  —  produces supabase/seed.sql for LOCAL dev
--
-- Run this against PROD with psql; it PRINTS INSERT statements (it does not
-- modify anything). Real salary/rate numbers are kept; names and personal
-- identifiers (CURP, RFC, NSS, bank, address, phone, email, DOB, etc.) are
-- dropped or replaced with "Empleado <code>".
--
-- Usage:
--   psql "<PROD_SESSION_POOLER_URI>" -At -f generate_seed.sql > supabase/seed.sql
--
-- Then load supabase/seed.sql into a FRESH local DB (after `supabase db reset`).
-- Load order below respects foreign keys; the employees<->campaigns circular
-- ref is handled by inserting campaigns/employees with the back-reference NULL,
-- then UPDATE-ing it after both exist.
-- =============================================================================

\pset footer off

select '-- AUTO-GENERATED LOCAL SEED (anonymized: fake names, real pay figures). Do not load into prod.';
select '-- organizations';
select string_agg(format(
  'insert into public.organizations (id,name,slug,created_at,employee_id_prefix) values (%L,%L,%L,%L,%L);',
  id,name,slug,created_at,employee_id_prefix), E'\n') from public.organizations;

select '-- clients';
select string_agg(format(
  'insert into public.clients (id,name,prefix,bill_to_name,bill_to_address,created_at,subtitle,organization_id,is_billable,aliases,is_active) values (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L);',
  id,name,prefix,bill_to_name,bill_to_address,created_at,subtitle,organization_id,is_billable,aliases,is_active), E'\n') from public.clients;

select '-- campaigns (team_lead_id set later)';
select string_agg(format(
  'insert into public.campaigns (id,client_id,name,created_at,eod_digest_cutoff_time,eod_digest_timezone,eod_reply_to_email,eod_morning_bundle_time,requires_holiday_coverage,organization_id,early_release_enabled,early_release_criteria,is_active,include_agents_in_eod_digest,eod_digest_enabled) values (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L);',
  id,client_id,name,created_at,eod_digest_cutoff_time,eod_digest_timezone,eod_reply_to_email,eod_morning_bundle_time,requires_holiday_coverage,organization_id,early_release_enabled,early_release_criteria,is_active,include_agents_in_eod_digest,eod_digest_enabled), E'\n') from public.campaigns;

select '-- employees (anonymized names/identifiers; real pay; reports_to set later)';
select string_agg(format(
  'insert into public.employees (id,employee_id,full_name,title,employment_status,is_active,is_system_user,goal_visible_to_tl,goal_prompt_dismissed,organization_id,campaign_id,shift_type,hire_date,monthly_base_salary,weekly_base_salary,daily_salary,daily_discount_rate,kpi_bonus_amount,overtime_day_pay,sunday_bonus_amount,vacation_premium_pct,vacation_days_entitled,daily_bill_rate,flat_weekly_bill_amount,flat_bill_client_id) values (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L);',
  id, employee_id, 'Empleado '||employee_id, title, employment_status, is_active, is_system_user, goal_visible_to_tl, goal_prompt_dismissed, organization_id, campaign_id, shift_type, hire_date, monthly_base_salary, weekly_base_salary, daily_salary, daily_discount_rate, kpi_bonus_amount, overtime_day_pay, sunday_bonus_amount, vacation_premium_pct, vacation_days_entitled, daily_bill_rate, flat_weekly_bill_amount, flat_bill_client_id), E'\n') from public.employees;

select '-- wire up employees.reports_to';
select string_agg(format(
  'update public.employees set reports_to=%L where id=%L;', reports_to, id), E'\n')
  from public.employees where reports_to is not null;

select '-- wire up campaigns.team_lead_id';
select string_agg(format(
  'update public.campaigns set team_lead_id=%L where id=%L;', team_lead_id, id), E'\n')
  from public.campaigns where team_lead_id is not null;

select '-- shift_settings (updated_by dropped)';
select string_agg(format(
  'insert into public.shift_settings (id,campaign_id,shift_name,start_time,end_time,grace_minutes,days_of_week,updated_at,break_grace_minutes) values (%L,%L,%L,%L,%L,%L,%L,%L,%L);',
  id,campaign_id,shift_name,start_time,end_time,grace_minutes,days_of_week,updated_at,break_grace_minutes), E'\n') from public.shift_settings;

select '-- mexican_holidays';
select string_agg(format(
  'insert into public.mexican_holidays (date,name,name_es,name_en,type,pays_premium) values (%L,%L,%L,%L,%L,%L);',
  date,name,name_es,name_en,type,pays_premium), E'\n') from public.mexican_holidays;

select '-- payroll_periods (locked_by dropped)';
select string_agg(format(
  'insert into public.payroll_periods (id,period_code,year,month,half,start_date,end_date,status,organization_id,created_at,period_type) values (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L);',
  id,period_code,year,month,half,start_date,end_date,status,organization_id,created_at,period_type), E'\n') from public.payroll_periods;

select '-- payroll_weeks (status_changed_by dropped)';
select string_agg(format(
  'insert into public.payroll_weeks (id,period_id,week_number,week_start,week_end,status,status_changed_at,organization_id,created_at) values (%L,%L,%L,%L,%L,%L,%L,%L,%L);',
  id,period_id,week_number,week_start,week_end,status,status_changed_at,organization_id,created_at), E'\n') from public.payroll_weeks;

select '-- payroll_records (memo dropped)';
select string_agg(format(
  'insert into public.payroll_records (id,week_id,employee_id,campaign_id,organization_id,include_in_payroll,missed_days,overtime_days,sundays_worked,vacation_days,holiday_days,kpi_achieved,extra_bonus,partial_week_days,weekly_base,kpi_bonus,missed_deduction,overtime_pay,sunday_pay,vacation_pay,holiday_pay,total_pay,status,auto_derived,created_at,updated_at,commission,commission_flag,custom_deduction) values (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L);',
  id,week_id,employee_id,campaign_id,organization_id,include_in_payroll,missed_days,overtime_days,sundays_worked,vacation_days,holiday_days,kpi_achieved,extra_bonus,partial_week_days,weekly_base,kpi_bonus,missed_deduction,overtime_pay,sunday_pay,vacation_pay,holiday_pay,total_pay,status,auto_derived,created_at,updated_at,commission,commission_flag,custom_deduction), E'\n')
  from public.payroll_records;

select '-- time_clock (in-period punches only; late-reason free-text dropped)';
select string_agg(format(
  'insert into public.time_clock (id,employee_id,clock_in,clock_out,date,total_hours,is_late,late_minutes,created_at,lunch_start,lunch_end,break1_start,break1_end,break2_start,break2_end,shift_end_expected,auto_clocked_out,eod_completed,early_release) values (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L);',
  id,employee_id,clock_in,clock_out,date,total_hours,is_late,late_minutes,created_at,lunch_start,lunch_end,break1_start,break1_end,break2_start,break2_end,shift_end_expected,auto_clocked_out,eod_completed,early_release), E'\n')
  from public.time_clock where date between date '2026-05-16' and date '2026-05-31';
