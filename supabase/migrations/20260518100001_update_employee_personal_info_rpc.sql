-- ============================================================
-- update_employee_personal_info(...)
-- ------------------------------------------------------------
-- Lets TLs (within their team) and agents (only themselves)
-- update a strict whitelist of 5 contact fields:
--   work_name, personal_email, phone, address, emergency_contact
--
-- Why an RPC instead of loosening RLS on employees:
--   - Postgres RLS is row-level; we need column-level limits.
--   - SECURITY DEFINER + an explicit UPDATE column list is the
--     simplest way to guarantee TLs/agents cannot touch salary,
--     campaign_id, title, hire_date, etc.
--
-- Argument semantics:
--   - NULL  -> field omitted, don't touch
--   - ''    -> clear the field (store NULL)
--   - other -> validate (where applicable) and store
--
-- Leadership keeps the existing direct UPDATE path via RLS.
-- ============================================================

create or replace function public.update_employee_personal_info(
  p_employee_uuid uuid,
  p_work_name text default null,
  p_personal_email text default null,
  p_phone text default null,
  p_address text default null,
  p_emergency_contact text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_org uuid;
  v_target_campaign uuid;
  v_my_employee_id uuid := my_employee_id();
  v_my_org uuid := my_org_id();
  v_allowed boolean := false;
  v_email_clean text;
  v_phone_clean text;
  v_work_name_clean text;
  v_address_clean text;
  v_emergency_clean text;
begin
  -- Look up the target row
  select organization_id, campaign_id
    into v_target_org, v_target_campaign
  from public.employees
  where id = p_employee_uuid;

  if v_target_org is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  -- Same-org check (defence in depth — RLS would catch this too)
  if v_target_org <> v_my_org then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Permission gate
  if is_leadership() then
    v_allowed := true;
  elsif v_my_employee_id is not null and v_my_employee_id = p_employee_uuid then
    -- Self-edit
    v_allowed := true;
  elsif is_team_lead() and (
      v_target_campaign in (select my_tl_campaign_ids())
      or p_employee_uuid in (select my_team_member_ids())
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'not authorized to update this employee' using errcode = '42501';
  end if;

  -- Normalize: '' -> NULL (clear), trim whitespace on non-null inputs
  v_work_name_clean  := case when p_work_name is null then null
                             when length(trim(p_work_name)) = 0 then null
                             else trim(p_work_name) end;
  v_address_clean    := case when p_address is null then null
                             when length(trim(p_address)) = 0 then null
                             else trim(p_address) end;
  v_emergency_clean  := case when p_emergency_contact is null then null
                             when length(trim(p_emergency_contact)) = 0 then null
                             else trim(p_emergency_contact) end;

  -- Email: NULL = skip, '' = clear, else validate
  if p_personal_email is null then
    v_email_clean := null;
  elsif length(trim(p_personal_email)) = 0 then
    v_email_clean := ''; -- sentinel meaning "clear" — handled below
  else
    if trim(p_personal_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'invalid email format' using errcode = '22023';
    end if;
    v_email_clean := trim(p_personal_email);
  end if;

  -- Phone: NULL = skip, '' = clear, else strip+validate
  if p_phone is null then
    v_phone_clean := null;
  elsif length(regexp_replace(p_phone, '[[:space:]-]', '', 'g')) = 0 then
    v_phone_clean := ''; -- sentinel for clear
  else
    v_phone_clean := regexp_replace(p_phone, '[[:space:]-]', '', 'g');
    if v_phone_clean !~ '^[0-9]{10}$' then
      raise exception 'phone must be 10 digits' using errcode = '22023';
    end if;
  end if;

  -- Apply: for each field, decide skip / clear / write
  update public.employees
  set
    work_name = case
      when p_work_name is null then work_name
      when v_work_name_clean is null then null
      else v_work_name_clean
    end,
    personal_email = case
      when p_personal_email is null then personal_email
      when v_email_clean = '' then null
      else v_email_clean
    end,
    phone = case
      when p_phone is null then phone
      when v_phone_clean = '' then null
      else v_phone_clean
    end,
    address = case
      when p_address is null then address
      when v_address_clean is null then null
      else v_address_clean
    end,
    emergency_contact = case
      when p_emergency_contact is null then emergency_contact
      when v_emergency_clean is null then null
      else v_emergency_clean
    end
  where id = p_employee_uuid;
end;
$$;

grant execute on function public.update_employee_personal_info(uuid, text, text, text, text, text) to authenticated;

comment on function public.update_employee_personal_info is
  'TL/self/leadership update of 5 contact fields on employees. Whitelist enforced inside function. See SECURITY_AUDIT_2026-05-18.md.';
