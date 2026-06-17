-- Fix: payroll period creation was failing with an RLS violation
-- ("new row violates row-level security policy for table payroll_periods").
--
-- Two root causes:
--   1) useCreatePeriod (src/hooks/useSupabasePayroll.ts) inserts only
--      start_date / end_date / period_type and never sets organization_id, so
--      the policy's WITH CHECK (organization_id = my_org_id()) could never pass.
--   2) Access was owner-only; D approved widening to owner + admin so Joe
--      (admin) can run the payroll rework.
--
-- Fix: stamp organization_id from the caller's org on insert (so no screen has
-- to remember it), and widen the policy to owner OR admin. Cross-org writes
-- remain blocked and the change is non-destructive.

-- Helper: owner OR admin in the caller's org. Mirrors is_owner()/is_leadership()
-- (keys off employees.title) with search_path pinned per the security advisor.
create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.employees e on up.employee_id = e.id
    where up.id = auth.uid()
      and e.organization_id = public.my_org_id()
      and e.title in ('owner', 'admin')
  );
$$;

-- Auto-stamp organization_id on insert so the RLS WITH CHECK can pass.
create or replace function public.set_payroll_period_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.my_org_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_payroll_period_org on public.payroll_periods;
create trigger trg_set_payroll_period_org
  before insert on public.payroll_periods
  for each row execute function public.set_payroll_period_org();

-- Widen access from owner-only to owner OR admin.
drop policy if exists payroll_periods_owner_all on public.payroll_periods;
create policy payroll_periods_admin_all on public.payroll_periods
  for all
  to authenticated
  using (public.is_owner_or_admin() and organization_id = public.my_org_id())
  with check (public.is_owner_or_admin() and organization_id = public.my_org_id());
