create table public.marketing_campaign_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  paid_on date not null,
  amount numeric(12,2) not null check (amount > 0),
  method text check (char_length(method) <= 80),
  reference text check (char_length(reference) <= 120),
  notes text check (char_length(notes) <= 500),
  created_by uuid default auth.uid() not null,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id)
    references public.marketing_campaigns (id, organization_id) on delete cascade
);

create index marketing_campaign_payments_history_idx on public.marketing_campaign_payments
  (organization_id, campaign_id, paid_on desc, created_at desc, id desc);

alter table public.marketing_campaign_payments enable row level security;
revoke all on public.marketing_campaign_payments from public, anon, authenticated;
grant select on public.marketing_campaign_payments to authenticated;
grant insert (id, organization_id, campaign_id, paid_on, amount, method, reference, notes)
  on public.marketing_campaign_payments to authenticated;

create policy marketing_campaign_payments_select on public.marketing_campaign_payments
for select to authenticated using (
  exists (
    select 1 from public.marketing_campaigns c
    where c.id = campaign_id and c.organization_id = marketing_campaign_payments.organization_id
  )
);

create policy marketing_campaign_payments_insert on public.marketing_campaign_payments
for insert to authenticated with check (
  created_by = (select auth.uid())
  and private.has_marketing_role(organization_id, array['owner', 'admin', 'marketing'])
);
