-- Perfis pessoais e ciclo de vida dos membros.
alter table public.marketing_memberships
  add column if not exists status text not null default 'active',
  add column if not exists invited_at timestamptz not null default now(),
  add column if not exists activated_at timestamptz,
  add column if not exists last_seen_at timestamptz;
alter table public.marketing_memberships drop constraint if exists marketing_memberships_status_check;
alter table public.marketing_memberships add constraint marketing_memberships_status_check
  check (status in ('invited','active','suspended'));
update public.marketing_memberships set activated_at = created_at where status = 'active' and activated_at is null;

create table if not exists public.marketing_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text,
  timezone text not null default 'America/Sao_Paulo',
  preferred_tab text not null default 'overview'
    check (preferred_tab in ('overview','leads','quotes','campaigns','analytics','team','profile')),
  compact_dashboard boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_user_profiles enable row level security;
drop policy if exists marketing_user_profiles_select_self on public.marketing_user_profiles;
create policy marketing_user_profiles_select_self on public.marketing_user_profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists marketing_user_profiles_insert_self on public.marketing_user_profiles;
create policy marketing_user_profiles_insert_self on public.marketing_user_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists marketing_user_profiles_update_self on public.marketing_user_profiles;
create policy marketing_user_profiles_update_self on public.marketing_user_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update on public.marketing_user_profiles to authenticated;

create or replace function private.marketing_profile_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists marketing_user_profiles_touch on public.marketing_user_profiles;
create trigger marketing_user_profiles_touch before update on public.marketing_user_profiles
  for each row execute function private.marketing_profile_touch_updated_at();
revoke all on function private.marketing_profile_touch_updated_at() from public, anon, authenticated;

create or replace function public.marketing_touch_user_activity(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Invalid user'; end if;
  update public.marketing_memberships set last_seen_at = now()
    where user_id = p_user_id and status = 'active';
end; $$;
revoke all on function public.marketing_touch_user_activity(uuid) from public, anon;
grant execute on function public.marketing_touch_user_activity(uuid) to authenticated;

create or replace function private.has_marketing_role(p_organization_id uuid, p_roles text[])
returns boolean language sql stable security definer
set search_path = public, private, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.marketing_memberships m
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any(p_roles)
  );
$$;
revoke all on function private.has_marketing_role(uuid, text[]) from public, anon;
grant execute on function private.has_marketing_role(uuid, text[]) to authenticated;
