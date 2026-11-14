-- Funções personalizadas nunca são interpretadas como o perfil padrão de gestor atribuído.
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
              or (array['sales','marketing','analyst','traffic_manager']::text[] <@ p_roles and cardinality(r.permissions) > 0)
            )
        )
      )
  );
$$;
revoke all on function private.has_marketing_role(uuid, text[]) from public, anon;
grant execute on function private.has_marketing_role(uuid, text[]) to authenticated;
