lock table public.marketing_campaigns, public.marketing_campaign_payments in share row exclusive mode;

create table private.marketing_campaign_legacy_totals as
select id as campaign_id, organization_id, spend_total, impressions, clicks, ads_conversions,
       now() as archived_at
from public.marketing_campaigns
where spend_total <> 0 or impressions <> 0 or clicks <> 0 or ads_conversions <> 0;
revoke all on private.marketing_campaign_legacy_totals from public, anon, authenticated;

alter table public.marketing_campaigns
  alter column spend_total type numeric(18,2),
  alter column impressions type bigint,
  alter column clicks type bigint,
  alter column ads_conversions type numeric(20,6);

alter table public.marketing_campaign_payments
  add constraint marketing_payment_amount_finite check (amount <> 'NaN'::numeric);

create table public.marketing_campaign_daily_reports (
  campaign_id uuid not null,
  organization_id uuid not null,
  report_date date not null check (report_date between date '2000-01-01' and date '9999-12-31'),
  impressions integer not null check (impressions >= 0),
  clicks integer not null check (clicks >= 0),
  conversions numeric(16,6) not null check (conversions >= 0 and conversions <> 'NaN'::numeric),
  received_at timestamptz not null default now(),
  primary key (campaign_id, report_date),
  foreign key (campaign_id, organization_id)
    references public.marketing_campaigns (id, organization_id) on delete cascade
);

alter table public.marketing_campaign_daily_reports enable row level security;
revoke all on public.marketing_campaign_daily_reports from public, anon, authenticated;
grant select on public.marketing_campaign_daily_reports to authenticated;
create policy marketing_campaign_daily_reports_select on public.marketing_campaign_daily_reports
for select to authenticated using (
  exists (
    select 1 from public.marketing_campaigns c
    where c.id = marketing_campaign_daily_reports.campaign_id
      and c.organization_id = marketing_campaign_daily_reports.organization_id
  )
);

create table private.marketing_campaign_report_keys (
  organization_id uuid primary key references public.marketing_organizations(id) on delete cascade,
  token_hash bytea not null unique,
  rotated_at timestamptz not null default now()
);
revoke all on private.marketing_campaign_report_keys from public, anon, authenticated;

create function public.marketing_rotate_campaign_report_key(p_organization_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  token text := 'lroi_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if private.has_marketing_role(p_organization_id, array['owner', 'admin']) is not true then
    raise exception using errcode = '42501', message = 'Acesso negado';
  end if;

  insert into private.marketing_campaign_report_keys (organization_id, token_hash)
  values (p_organization_id, sha256(convert_to(token, 'UTF8')))
  on conflict (organization_id) do update
    set token_hash = excluded.token_hash, rotated_at = now();

  return token;
end;
$$;
revoke all on function public.marketing_rotate_campaign_report_key(uuid) from public, anon, authenticated;
grant execute on function public.marketing_rotate_campaign_report_key(uuid) to authenticated;

create function public.marketing_ingest_campaign_report(
  p_token text, p_campaign_id uuid, p_report_date date,
  p_impressions integer, p_clicks integer, p_conversions numeric
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  target_org uuid;
begin
  select k.organization_id into target_org
  from private.marketing_campaign_report_keys k
  where k.token_hash = sha256(convert_to(p_token, 'UTF8'));

  if target_org is null then
    return 'unauthorized';
  end if;

  -- Hold the parent row so deletion cannot race the upsert. This also gives
  -- concurrent submissions for one campaign a consistent lock order.
  perform 1 from public.marketing_campaigns c
  where c.id = p_campaign_id and c.organization_id = target_org
  for no key update;
  if not found then
    return 'campaign_not_found';
  end if;

  insert into public.marketing_campaign_daily_reports as r
    (campaign_id, organization_id, report_date, impressions, clicks, conversions)
  values
    (p_campaign_id, target_org, p_report_date, p_impressions, p_clicks, p_conversions)
  on conflict (campaign_id, report_date) do update
    set impressions = excluded.impressions, clicks = excluded.clicks,
        conversions = excluded.conversions, received_at = now()
  where (r.impressions, r.clicks, r.conversions)
    is distinct from (excluded.impressions, excluded.clicks, excluded.conversions);

  return 'ok';
end;
$$;
revoke all on function public.marketing_ingest_campaign_report(text, uuid, date, integer, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.marketing_ingest_campaign_report(text, uuid, date, integer, integer, numeric) to anon;

create function private.marketing_apply_payment_total()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.marketing_campaigns
    set spend_total = spend_total + new.amount
    where id = new.campaign_id and organization_id = new.organization_id;
  elsif tg_op = 'UPDATE' then
    update public.marketing_campaigns
    set spend_total = spend_total + new.amount - old.amount
    where id = new.campaign_id and organization_id = new.organization_id;
  else
    update public.marketing_campaigns
    set spend_total = spend_total - old.amount
    where id = old.campaign_id and organization_id = old.organization_id;
  end if;
  return null;
end;
$$;
revoke all on function private.marketing_apply_payment_total() from public, anon, authenticated;
create trigger marketing_apply_payment_total
after insert or update of amount or delete on public.marketing_campaign_payments
for each row execute function private.marketing_apply_payment_total();

create function private.marketing_apply_report_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.marketing_campaigns
    set impressions = impressions + new.impressions, clicks = clicks + new.clicks,
        ads_conversions = ads_conversions + new.conversions
    where id = new.campaign_id and organization_id = new.organization_id;
  elsif tg_op = 'UPDATE' then
    update public.marketing_campaigns
    set impressions = impressions + new.impressions - old.impressions,
        clicks = clicks + new.clicks - old.clicks,
        ads_conversions = ads_conversions + new.conversions - old.conversions
    where id = new.campaign_id and organization_id = new.organization_id;
  else
    update public.marketing_campaigns
    set impressions = impressions - old.impressions, clicks = clicks - old.clicks,
        ads_conversions = ads_conversions - old.conversions
    where id = old.campaign_id and organization_id = old.organization_id;
  end if;
  return null;
end;
$$;
revoke all on function private.marketing_apply_report_totals() from public, anon, authenticated;
create trigger marketing_apply_report_totals
after insert or update or delete on public.marketing_campaign_daily_reports
for each row execute function private.marketing_apply_report_totals();

update public.marketing_campaigns c set
  spend_total = coalesce((
    select sum(p.amount) from public.marketing_campaign_payments p
    where p.campaign_id = c.id and p.organization_id = c.organization_id
  ), 0),
  impressions = 0, clicks = 0, ads_conversions = 0;

create function private.marketing_protect_campaign_totals()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.spend_total := 0;
    new.impressions := 0;
    new.clicks := 0;
    new.ads_conversions := 0;
  elsif pg_trigger_depth() = 1 then
    new.spend_total := old.spend_total;
    new.impressions := old.impressions;
    new.clicks := old.clicks;
    new.ads_conversions := old.ads_conversions;
  end if;
  return new;
end;
$$;
revoke all on function private.marketing_protect_campaign_totals() from public, anon, authenticated;
create trigger marketing_protect_campaign_totals
before insert or update on public.marketing_campaigns
for each row execute function private.marketing_protect_campaign_totals();
