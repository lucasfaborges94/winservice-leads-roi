-- Perfil de gestor de tráfego com acesso isolado às campanhas atribuídas.
alter table public.marketing_memberships
  drop constraint if exists marketing_memberships_role_check;
alter table public.marketing_memberships
  add constraint marketing_memberships_role_check
  check (role in ('owner', 'admin', 'sales', 'marketing', 'analyst', 'traffic_manager'));

alter table public.marketing_campaigns
  add column if not exists manager_user_id uuid references auth.users(id) on delete set null;
create index if not exists marketing_campaigns_manager_idx
  on public.marketing_campaigns (organization_id, manager_user_id, created_at desc);

create or replace function private.guard_campaign_manager_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.manager_user_id is distinct from old.manager_user_id
     and not private.has_marketing_role(new.organization_id, array['owner','admin']) then
    raise exception 'Only owners and admins may assign campaign managers';
  end if;
  if new.manager_user_id is not null and not exists (
    select 1 from public.marketing_memberships m
    where m.organization_id = new.organization_id
      and m.user_id = new.manager_user_id
      and m.role = 'traffic_manager'
  ) then
    raise exception 'The assigned user must be a traffic manager in this organization';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_campaign_manager_assignment() from public, anon, authenticated;
drop trigger if exists marketing_campaign_manager_guard on public.marketing_campaigns;
create trigger marketing_campaign_manager_guard
  before insert or update of manager_user_id, organization_id
  on public.marketing_campaigns
  for each row execute function private.guard_campaign_manager_assignment();

drop policy if exists marketing_campaigns_select on public.marketing_campaigns;
create policy marketing_campaigns_select on public.marketing_campaigns for select to authenticated
using (
  private.has_marketing_role(organization_id, array['owner','admin','marketing','analyst'])
  or (manager_user_id = (select auth.uid())
      and private.has_marketing_role(organization_id, array['traffic_manager']))
);

create or replace function public.marketing_campaign_options(p_organization_id uuid)
returns table(id uuid, name text, platform text)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select c.id, c.name, c.platform
  from public.marketing_campaigns c
  where c.organization_id = p_organization_id
    and (
      private.has_marketing_role(p_organization_id, array['owner','admin','sales','marketing','analyst'])
      or (c.manager_user_id = (select auth.uid())
          and private.has_marketing_role(p_organization_id, array['traffic_manager']))
    )
  order by c.name;
$$;
revoke all on function public.marketing_campaign_options(uuid) from public, anon;
grant execute on function public.marketing_campaign_options(uuid) to authenticated;

create or replace function public.marketing_dashboard(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result jsonb;
  v_is_traffic_manager boolean;
begin
  v_is_traffic_manager := private.has_marketing_role(p_organization_id, array['traffic_manager']);
  if not private.has_marketing_role(p_organization_id, array['owner','admin','marketing','analyst','traffic_manager']) then
    raise exception 'Insufficient role';
  end if;
  select jsonb_build_object(
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'platform', c.platform, 'status', c.status,
        'spend_total', c.spend_total, 'impressions', c.impressions, 'clicks', c.clicks,
        'ads_conversions', c.ads_conversions, 'period_start', c.period_start, 'period_end', c.period_end,
        'leads', (select count(*) from public.marketing_leads l where l.campaign_id = c.id and l.organization_id = p_organization_id),
        'qualified', (select count(*) from public.marketing_leads l where l.campaign_id = c.id and l.organization_id = p_organization_id and l.is_qualified),
        'won', (select count(*) from public.marketing_leads l where l.campaign_id = c.id and l.organization_id = p_organization_id and l.stage = 'won'),
        'revenue', (select coalesce(sum(l.won_revenue),0) from public.marketing_leads l where l.campaign_id = c.id and l.organization_id = p_organization_id)
      ) order by c.created_at desc)
      from public.marketing_campaigns c
      where c.organization_id = p_organization_id
        and (not v_is_traffic_manager or c.manager_user_id = (select auth.uid()))
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'campaign_spend', (select coalesce(sum(c.spend_total),0) from public.marketing_campaigns c where c.organization_id = p_organization_id and (not v_is_traffic_manager or c.manager_user_id = (select auth.uid()))),
      'leads', (select count(*) from public.marketing_leads l where l.organization_id = p_organization_id and (not v_is_traffic_manager or exists (select 1 from public.marketing_campaigns c where c.id = l.campaign_id and c.organization_id = p_organization_id and c.manager_user_id = (select auth.uid())))),
      'qualified', (select count(*) from public.marketing_leads l where l.organization_id = p_organization_id and l.is_qualified and (not v_is_traffic_manager or exists (select 1 from public.marketing_campaigns c where c.id = l.campaign_id and c.organization_id = p_organization_id and c.manager_user_id = (select auth.uid())))),
      'won', (select count(*) from public.marketing_leads l where l.organization_id = p_organization_id and l.stage = 'won' and (not v_is_traffic_manager or exists (select 1 from public.marketing_campaigns c where c.id = l.campaign_id and c.organization_id = p_organization_id and c.manager_user_id = (select auth.uid())))),
      'revenue', (select coalesce(sum(l.won_revenue),0) from public.marketing_leads l where l.organization_id = p_organization_id and (not v_is_traffic_manager or exists (select 1 from public.marketing_campaigns c where c.id = l.campaign_id and c.organization_id = p_organization_id and c.manager_user_id = (select auth.uid())))),
      'quotes_sent', (select count(*) from public.marketing_quotes q join public.marketing_leads l on l.id = q.lead_id and l.organization_id = q.organization_id where q.organization_id = p_organization_id and q.status in ('sent','follow_up') and (not v_is_traffic_manager or exists (select 1 from public.marketing_campaigns c where c.id = l.campaign_id and c.organization_id = p_organization_id and c.manager_user_id = (select auth.uid())))),
      'quotes_paid', (select count(*) from public.marketing_quotes q join public.marketing_leads l on l.id = q.lead_id and l.organization_id = q.organization_id where q.organization_id = p_organization_id and q.status = 'paid' and (not v_is_traffic_manager or exists (select 1 from public.marketing_campaigns c where c.id = l.campaign_id and c.organization_id = p_organization_id and c.manager_user_id = (select auth.uid()))))
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.marketing_dashboard(uuid) from public, anon;
grant execute on function public.marketing_dashboard(uuid) to authenticated;
