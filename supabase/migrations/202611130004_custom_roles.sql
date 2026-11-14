-- Roles personalizadas e permissões configuráveis; roles padrão permanecem imutáveis.
create table if not exists public.marketing_custom_roles (
  role_key text primary key default ('custom:' || gen_random_uuid()::text),
  organization_id uuid not null references public.marketing_organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  permissions text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (permissions <@ array['crm','campaign_manage','analytics']::text[])
);
create unique index if not exists marketing_custom_roles_name_idx on public.marketing_custom_roles(organization_id, lower(name));
create index if not exists marketing_custom_roles_org_idx on public.marketing_custom_roles(organization_id);
alter table public.marketing_custom_roles enable row level security;
drop policy if exists marketing_custom_roles_select on public.marketing_custom_roles;
create policy marketing_custom_roles_select on public.marketing_custom_roles for select to authenticated using (
  private.has_marketing_role(organization_id, array['owner','admin']) or exists (
    select 1 from public.marketing_memberships m where m.organization_id = marketing_custom_roles.organization_id
      and m.user_id = (select auth.uid()) and m.role = marketing_custom_roles.role_key and m.status = 'active'
  )
);
drop policy if exists marketing_custom_roles_insert on public.marketing_custom_roles;
create policy marketing_custom_roles_insert on public.marketing_custom_roles for insert to authenticated
  with check (created_by = (select auth.uid()) and private.has_marketing_role(organization_id, array['owner','admin']));
drop policy if exists marketing_custom_roles_update on public.marketing_custom_roles;
create policy marketing_custom_roles_update on public.marketing_custom_roles for update to authenticated
  using (private.has_marketing_role(organization_id, array['owner','admin']))
  with check (private.has_marketing_role(organization_id, array['owner','admin']));
drop policy if exists marketing_custom_roles_delete on public.marketing_custom_roles;
create policy marketing_custom_roles_delete on public.marketing_custom_roles for delete to authenticated
  using (private.has_marketing_role(organization_id, array['owner','admin']) and not exists (
    select 1 from public.marketing_memberships m where m.organization_id = marketing_custom_roles.organization_id and m.role = marketing_custom_roles.role_key
  ));
grant select, insert, update, delete on public.marketing_custom_roles to authenticated;

alter table public.marketing_memberships drop constraint if exists marketing_memberships_role_check;
alter table public.marketing_memberships add constraint marketing_memberships_role_check check (
  role in ('owner','admin','sales','marketing','analyst','traffic_manager') or role like 'custom:%'
);

create or replace function private.has_marketing_role(p_organization_id uuid, p_roles text[])
returns boolean language sql stable security definer
set search_path = public, private, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.marketing_memberships m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.status = 'active'
      and (
        m.role = any(p_roles)
        or exists (
          select 1 from public.marketing_custom_roles r
          where r.organization_id = m.organization_id and r.role_key = m.role
            and (
              ('sales' = any(p_roles) and 'crm' = any(r.permissions))
              or ('marketing' = any(p_roles) and 'campaign_manage' = any(r.permissions))
              or ('analyst' = any(p_roles) and ('analytics' = any(r.permissions) or 'campaign_manage' = any(r.permissions)))
              or ('traffic_manager' = any(p_roles) and 'analytics' = any(r.permissions))
              or (array['sales','marketing','analyst','traffic_manager']::text[] <@ p_roles and cardinality(r.permissions) > 0)
            )
        )
      )
  );
$$;
revoke all on function private.has_marketing_role(uuid, text[]) from public, anon;
grant execute on function private.has_marketing_role(uuid, text[]) to authenticated;

create or replace function private.validate_membership_role()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.role like 'custom:%' and not exists (
    select 1 from public.marketing_custom_roles r where r.organization_id = new.organization_id and r.role_key = new.role
  ) then raise exception 'Custom role does not exist in this organization'; end if;
  return new;
end; $$;
revoke all on function private.validate_membership_role() from public, anon, authenticated;
drop trigger if exists marketing_membership_role_guard on public.marketing_memberships;
create trigger marketing_membership_role_guard before insert or update of role, organization_id
  on public.marketing_memberships for each row execute function private.validate_membership_role();
