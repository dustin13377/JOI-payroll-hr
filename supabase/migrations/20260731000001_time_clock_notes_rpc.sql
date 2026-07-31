-- Read helper for the punch-edit dialog's notes history.
-- Surfaces the existing time_clock_audit reasons (one per edit) with the
-- editor's name resolved, newest first, capped at 10. SECURITY DEFINER so a
-- team lead can see WHO wrote each note (they can't read other user_profiles
-- rows directly); an internal guard mirrors the time_clock_audit RLS so it
-- never leaks beyond leadership / the employee's own team lead.
create or replace function public.get_time_clock_notes(p_employee_id uuid, p_date date)
returns table (reason text, action text, edited_at timestamptz, editor_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    (is_leadership() and exists (
       select 1 from employees e
       where e.id = p_employee_id and e.organization_id = my_org_id()))
    or (is_team_lead() and exists (
       select 1 from employees e
       where e.id = p_employee_id
         and e.campaign_id in (select my_tl_campaign_ids())))
  ) then
    return; -- unauthorized: empty set, no error
  end if;

  return query
  select a.reason,
         a.action,
         a.edited_at,
         coalesce(e.full_name, 'Unknown') as editor_name
  from time_clock_audit a
  left join user_profiles up on up.id = a.edited_by
  left join employees e on e.id = up.employee_id
  where a.employee_id = p_employee_id
    and a.date = p_date
  order by a.edited_at desc
  limit 10;
end;
$$;

revoke all on function public.get_time_clock_notes(uuid, date) from public;
grant execute on function public.get_time_clock_notes(uuid, date) to authenticated;
