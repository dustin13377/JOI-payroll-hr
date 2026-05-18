-- ============================================================
-- Lock down EXECUTE on update_employee_personal_info
-- ------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default for new functions.
-- We want only logged-in users (authenticated) to call this — anon and
-- public should be blocked.
--
-- Defence in depth: the function body also rejects unauthenticated callers
-- (my_org_id() is NULL, permission gate falls through), so this revoke is
-- belt-and-suspenders rather than the primary check.
-- ============================================================

revoke execute on function public.update_employee_personal_info(uuid, text, text, text, text, text) from public;
revoke execute on function public.update_employee_personal_info(uuid, text, text, text, text, text) from anon;
grant  execute on function public.update_employee_personal_info(uuid, text, text, text, text, text) to authenticated;
