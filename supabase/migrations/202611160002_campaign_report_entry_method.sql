create or replace function public.marketing_ingest_campaign_report(
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
        conversions = excluded.conversions, entry_method = 'automatic', received_at = now()
  where (r.impressions, r.clicks, r.conversions, r.entry_method)
    is distinct from (excluded.impressions, excluded.clicks, excluded.conversions, excluded.entry_method);

  return 'ok';
end;
$$;
