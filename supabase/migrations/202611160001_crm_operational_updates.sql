alter table public.marketing_campaigns add column if not exists external_account_id text, add column if not exists appliance text;
alter table public.marketing_quotes add column if not exists detailed_url text check (detailed_url is null or detailed_url ~* '^https?://');
alter table public.marketing_leads alter column appliance set default 'Não informado';
alter table public.marketing_leads add column if not exists entry_method text not null default 'manual' check (entry_method in ('manual','automatic'));
alter policy marketing_leads_delete on public.marketing_leads using (private.has_marketing_role(organization_id, array['owner']));

create table if not exists public.marketing_campaign_daily_reports (
  organization_id uuid not null,
  campaign_id uuid not null,
  report_date date not null,
  spend numeric(12,2) not null check (spend >= 0),
  impressions integer not null check (impressions >= 0),
  clicks integer not null check (clicks >= 0),
  conversions numeric(12,2) not null check (conversions >= 0),
  entry_method text not null default 'manual' check (entry_method in ('manual','automatic')),
  primary key (campaign_id, report_date),
  foreign key (campaign_id, organization_id) references public.marketing_campaigns(id, organization_id) on delete cascade
);
alter table public.marketing_campaign_daily_reports
add column if not exists spend numeric(12,2) not null default 0 check (spend >= 0),
add column if not exists entry_method text not null default 'automatic' check (entry_method in ('manual','automatic'));
alter table public.marketing_campaign_daily_reports alter column entry_method set default 'automatic';
alter table public.marketing_campaign_daily_reports enable row level security;
grant select, insert, update on public.marketing_campaign_daily_reports to authenticated;
drop policy if exists marketing_campaign_daily_reports_select on public.marketing_campaign_daily_reports;
create policy marketing_campaign_daily_reports_select on public.marketing_campaign_daily_reports for select to authenticated
using (exists (select 1 from public.marketing_campaigns c where c.id = marketing_campaign_daily_reports.campaign_id and c.organization_id = marketing_campaign_daily_reports.organization_id));
create policy daily_reports_insert on public.marketing_campaign_daily_reports for insert to authenticated
with check (entry_method = 'manual' and private.has_marketing_role(organization_id, array['owner','admin','marketing']));
create policy daily_reports_update on public.marketing_campaign_daily_reports for update to authenticated
using (entry_method = 'manual' and private.has_marketing_role(organization_id, array['owner','admin','marketing']))
with check (entry_method = 'manual' and private.has_marketing_role(organization_id, array['owner','admin','marketing']));

create function private.capture_automatic_whatsapp_contact() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.entry_method = 'automatic' and new.preferred_contact_channel = 'WhatsApp' and new.phone <> '' then
    insert into public.marketing_lead_contacts (organization_id, lead_id, channel, value, is_primary)
    values (new.organization_id, new.id, 'WhatsApp', new.phone, true);
  end if;
  return new;
end;
$$;
revoke all on function private.capture_automatic_whatsapp_contact() from public, anon, authenticated;
create trigger marketing_automatic_whatsapp_contact after insert on public.marketing_leads
for each row execute function private.capture_automatic_whatsapp_contact();

update public.marketing_leads set entry_method = 'automatic'
where id::text like '37f1c8a0-f436-4017-%';
insert into public.marketing_lead_contacts (organization_id, lead_id, channel, value, is_primary)
select l.organization_id, l.id, 'WhatsApp', l.phone,
  not exists (select 1 from public.marketing_lead_contacts c where c.lead_id = l.id and c.is_primary)
from public.marketing_leads l
where l.entry_method = 'automatic' and l.preferred_contact_channel = 'WhatsApp' and l.phone <> ''
and not exists (select 1 from public.marketing_lead_contacts c where c.lead_id = l.id and c.channel = 'WhatsApp');
