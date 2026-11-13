-- CRM de leads e orçamento com isolamento por organização e RBAC.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.marketing_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha equipe',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, created_by)
);

create table if not exists public.marketing_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.marketing_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('owner', 'admin', 'sales', 'marketing', 'analyst')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);

create or replace function private.has_marketing_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.marketing_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;
revoke all on function private.has_marketing_role(uuid, text[]) from public, anon;
grant execute on function private.has_marketing_role(uuid, text[]) to authenticated;

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.marketing_organizations(id) on delete cascade,
  name text not null,
  platform text not null default 'Google Ads' check (platform in ('Google Ads', 'Meta Ads', 'Orgânico', 'Indicação', 'Outro')),
  external_campaign_id text,
  objective text,
  landing_page text,
  target_location text not null default 'Porto Alegre',
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  period_start date,
  period_end date,
  daily_budget numeric(12,2) not null default 0 check (daily_budget >= 0),
  spend_total numeric(12,2) not null default 0 check (spend_total >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  ads_conversions numeric(12,2) not null default 0 check (ads_conversions >= 0),
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.marketing_organizations(id) on delete cascade,
  campaign_id uuid,
  full_name text not null,
  phone text not null default '',
  email text,
  appliance text not null default 'Geladeira',
  service_description text,
  city text not null default 'Porto Alegre',
  neighborhood text,
  acquisition_source text not null default 'Google Ads',
  preferred_contact_channel text not null default 'WhatsApp'
    check (preferred_contact_channel in ('WhatsApp','Telegram','E-mail','Ligação telefônica','Outro')),
  medium text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_page text,
  search_term text,
  gclid text,
  wbraid text,
  gbraid text,
  stage text not null default 'new' check (stage in ('new', 'contacted', 'qualified', 'quote_sent', 'negotiation', 'won', 'lost')),
  is_qualified boolean not null default false,
  qualification_notes text,
  first_contact_at timestamptz not null default now(),
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  lost_reason text,
  won_revenue numeric(12,2) not null default 0 check (won_revenue >= 0),
  closed_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint marketing_leads_campaign_same_org foreign key (campaign_id, organization_id)
    references public.marketing_campaigns(id, organization_id) on delete set null (campaign_id)
);

create table if not exists public.marketing_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.marketing_organizations(id) on delete cascade,
  lead_id uuid not null,
  quote_number text,
  title text not null,
  description text,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'follow_up', 'approved', 'rejected', 'expired', 'paid')),
  issued_at timestamptz,
  valid_until date,
  next_follow_up_at timestamptz,
  last_follow_up_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_quotes_lead_same_org foreign key (lead_id, organization_id)
    references public.marketing_leads(id, organization_id) on delete cascade
);

create table if not exists public.marketing_lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.marketing_organizations(id) on delete cascade,
  lead_id uuid not null,
  activity_type text not null check (activity_type in ('created', 'contact', 'stage_change', 'qualification', 'quote_created', 'quote_sent', 'quote_follow_up', 'quote_status', 'note')),
  title text not null,
  details text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint marketing_activities_lead_same_org foreign key (lead_id, organization_id)
    references public.marketing_leads(id, organization_id) on delete cascade
);

create table if not exists public.marketing_lead_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.marketing_organizations(id) on delete cascade,
  lead_id uuid not null,
  channel text not null check (channel in ('WhatsApp','Telegram','E-mail','Ligação telefônica','Instagram','Site','Outro')),
  value text not null,
  label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint marketing_contacts_lead_same_org foreign key (lead_id, organization_id)
    references public.marketing_leads(id, organization_id) on delete cascade
);

create index if not exists marketing_memberships_user_idx on public.marketing_memberships(user_id, organization_id);
create index if not exists marketing_campaigns_org_idx on public.marketing_campaigns(organization_id, created_at desc);
create index if not exists marketing_leads_org_stage_idx on public.marketing_leads(organization_id, stage, first_contact_at desc);
create index if not exists marketing_leads_campaign_idx on public.marketing_leads(campaign_id);
create index if not exists marketing_quotes_org_status_idx on public.marketing_quotes(organization_id, status, next_follow_up_at);
create index if not exists marketing_activities_lead_idx on public.marketing_lead_activities(lead_id, created_at desc);
create index if not exists marketing_contacts_lead_idx on public.marketing_lead_contacts(lead_id, is_primary desc);

create or replace function public.marketing_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists marketing_campaigns_touch on public.marketing_campaigns;
create trigger marketing_campaigns_touch before update on public.marketing_campaigns
for each row execute function public.marketing_touch_updated_at();
drop trigger if exists marketing_leads_touch on public.marketing_leads;
create trigger marketing_leads_touch before update on public.marketing_leads
for each row execute function public.marketing_touch_updated_at();
drop trigger if exists marketing_quotes_touch on public.marketing_quotes;
create trigger marketing_quotes_touch before update on public.marketing_quotes
for each row execute function public.marketing_touch_updated_at();
drop trigger if exists marketing_organizations_touch on public.marketing_organizations;
create trigger marketing_organizations_touch before update on public.marketing_organizations
for each row execute function public.marketing_touch_updated_at();

alter table public.marketing_organizations enable row level security;
alter table public.marketing_memberships enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_leads enable row level security;
alter table public.marketing_quotes enable row level security;
alter table public.marketing_lead_activities enable row level security;
alter table public.marketing_lead_contacts enable row level security;

drop policy if exists marketing_organizations_select on public.marketing_organizations;
create policy marketing_organizations_select on public.marketing_organizations for select to authenticated
using (private.has_marketing_role(id, array['owner','admin','sales','marketing','analyst']));
drop policy if exists marketing_organizations_insert on public.marketing_organizations;
create policy marketing_organizations_insert on public.marketing_organizations for insert to authenticated
with check (created_by = (select auth.uid()));
drop policy if exists marketing_organizations_update on public.marketing_organizations;
create policy marketing_organizations_update on public.marketing_organizations for update to authenticated
using (private.has_marketing_role(id, array['owner','admin'])) with check (private.has_marketing_role(id, array['owner','admin']));

drop policy if exists marketing_memberships_select on public.marketing_memberships;
create policy marketing_memberships_select on public.marketing_memberships for select to authenticated
using (user_id = (select auth.uid()) or private.has_marketing_role(organization_id, array['owner','admin']));
drop policy if exists marketing_memberships_insert on public.marketing_memberships;
create policy marketing_memberships_insert on public.marketing_memberships for insert to authenticated
with check (
  role <> 'owner'
  and private.has_marketing_role(organization_id, array['owner','admin'])
);
drop policy if exists marketing_memberships_update on public.marketing_memberships;
create policy marketing_memberships_update on public.marketing_memberships for update to authenticated
using (role <> 'owner' and private.has_marketing_role(organization_id, array['owner','admin']))
with check (role <> 'owner' and private.has_marketing_role(organization_id, array['owner','admin']));
drop policy if exists marketing_memberships_delete on public.marketing_memberships;
create policy marketing_memberships_delete on public.marketing_memberships for delete to authenticated
using (role <> 'owner' and private.has_marketing_role(organization_id, array['owner','admin']));

drop policy if exists marketing_campaigns_select on public.marketing_campaigns;
create policy marketing_campaigns_select on public.marketing_campaigns for select to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','marketing','analyst']));
drop policy if exists marketing_campaigns_insert on public.marketing_campaigns;
create policy marketing_campaigns_insert on public.marketing_campaigns for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_marketing_role(organization_id, array['owner','admin','marketing']));
drop policy if exists marketing_campaigns_update on public.marketing_campaigns;
create policy marketing_campaigns_update on public.marketing_campaigns for update to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','marketing']))
with check (private.has_marketing_role(organization_id, array['owner','admin','marketing']));
drop policy if exists marketing_campaigns_delete on public.marketing_campaigns;
create policy marketing_campaigns_delete on public.marketing_campaigns for delete to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','marketing']));

drop policy if exists marketing_leads_select on public.marketing_leads;
create policy marketing_leads_select on public.marketing_leads for select to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_leads_insert on public.marketing_leads;
create policy marketing_leads_insert on public.marketing_leads for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_leads_update on public.marketing_leads;
create policy marketing_leads_update on public.marketing_leads for update to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','sales']))
with check (private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_leads_delete on public.marketing_leads;
create policy marketing_leads_delete on public.marketing_leads for delete to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin']));

drop policy if exists marketing_quotes_select on public.marketing_quotes;
create policy marketing_quotes_select on public.marketing_quotes for select to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_quotes_insert on public.marketing_quotes;
create policy marketing_quotes_insert on public.marketing_quotes for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_quotes_update on public.marketing_quotes;
create policy marketing_quotes_update on public.marketing_quotes for update to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','sales']))
with check (private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_quotes_delete on public.marketing_quotes;
create policy marketing_quotes_delete on public.marketing_quotes for delete to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin']));

drop policy if exists marketing_activities_select on public.marketing_lead_activities;
create policy marketing_activities_select on public.marketing_lead_activities for select to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_activities_insert on public.marketing_lead_activities;
create policy marketing_activities_insert on public.marketing_lead_activities for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_marketing_role(organization_id, array['owner','admin','sales']));

drop policy if exists marketing_contacts_select on public.marketing_lead_contacts;
create policy marketing_contacts_select on public.marketing_lead_contacts for select to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_contacts_insert on public.marketing_lead_contacts;
create policy marketing_contacts_insert on public.marketing_lead_contacts for insert to authenticated
with check (private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_contacts_update on public.marketing_lead_contacts;
create policy marketing_contacts_update on public.marketing_lead_contacts for update to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','sales']))
with check (private.has_marketing_role(organization_id, array['owner','admin','sales']));
drop policy if exists marketing_contacts_delete on public.marketing_lead_contacts;
create policy marketing_contacts_delete on public.marketing_lead_contacts for delete to authenticated
using (private.has_marketing_role(organization_id, array['owner','admin','sales']));

grant select, insert, update, delete on public.marketing_organizations to authenticated;
grant select, insert, update, delete on public.marketing_memberships to authenticated;
grant select, insert, update, delete on public.marketing_campaigns to authenticated;
grant select, insert, update, delete on public.marketing_leads to authenticated;
grant select, insert, update, delete on public.marketing_quotes to authenticated;
grant select, insert on public.marketing_lead_activities to authenticated;
grant select, insert, update, delete on public.marketing_lead_contacts to authenticated;

create or replace function public.ensure_marketing_workspace()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_email text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select m.organization_id into v_org_id
  from public.marketing_memberships m
  where m.user_id = v_user_id
  order by m.created_at
  limit 1;
  if v_org_id is not null then return v_org_id; end if;
  select u.email into v_email from auth.users u where u.id = v_user_id;
  insert into public.marketing_organizations(name, created_by)
  values ('Winservice', v_user_id) returning id into v_org_id;
  insert into public.marketing_memberships(organization_id, user_id, email, role, created_by)
  values (v_org_id, v_user_id, v_email, 'owner', v_user_id);
  return v_org_id;
end;
$$;
revoke all on function public.ensure_marketing_workspace() from public, anon;
grant execute on function public.ensure_marketing_workspace() to authenticated;

create or replace function public.marketing_campaign_options(p_organization_id uuid)
returns table(id uuid, name text, platform text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.name, c.platform
  from public.marketing_campaigns c
  where c.organization_id = p_organization_id
    and private.has_marketing_role(p_organization_id, array['owner','admin','sales','marketing','analyst'])
  order by c.name;
$$;
revoke all on function public.marketing_campaign_options(uuid) from public, anon;
grant execute on function public.marketing_campaign_options(uuid) to authenticated;

create or replace function public.marketing_dashboard(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if not private.has_marketing_role(p_organization_id, array['owner','admin','marketing','analyst']) then
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
      from public.marketing_campaigns c where c.organization_id = p_organization_id
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'campaign_spend', (select coalesce(sum(spend_total),0) from public.marketing_campaigns where organization_id = p_organization_id),
      'leads', (select count(*) from public.marketing_leads where organization_id = p_organization_id),
      'qualified', (select count(*) from public.marketing_leads where organization_id = p_organization_id and is_qualified),
      'won', (select count(*) from public.marketing_leads where organization_id = p_organization_id and stage = 'won'),
      'revenue', (select coalesce(sum(won_revenue),0) from public.marketing_leads where organization_id = p_organization_id),
      'quotes_sent', (select count(*) from public.marketing_quotes where organization_id = p_organization_id and status in ('sent','follow_up')),
      'quotes_paid', (select count(*) from public.marketing_quotes where organization_id = p_organization_id and status = 'paid')
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.marketing_dashboard(uuid) from public, anon;
grant execute on function public.marketing_dashboard(uuid) to authenticated;

