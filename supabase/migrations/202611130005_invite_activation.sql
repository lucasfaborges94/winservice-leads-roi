-- Convites permanecem pendentes até o primeiro acesso; ativa o vínculo no login.
create or replace function public.marketing_touch_user_activity(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Invalid user'; end if;
  update public.marketing_memberships
    set status = 'active', activated_at = coalesce(activated_at, now()), last_seen_at = now()
    where user_id = p_user_id and status in ('invited','active');
end; $$;
revoke all on function public.marketing_touch_user_activity(uuid) from public, anon;
grant execute on function public.marketing_touch_user_activity(uuid) to authenticated;
