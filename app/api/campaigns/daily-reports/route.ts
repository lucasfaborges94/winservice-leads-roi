import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const tokenPattern = /^lroi_[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01") return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
}

function isConversions(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 2147483647;
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer (\S+)$/i)?.[1] ?? "";
  if (!tokenPattern.test(token)) {
    return NextResponse.json({ error: "Chave da integração inválida." }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Envie um objeto JSON." }, { status: 400 });
  }
  const { campaign_id, date, impressions, clicks, conversions } = body as Record<string, unknown>;
  if (typeof campaign_id !== "string" || !uuidPattern.test(campaign_id) ||
      !isDate(date) || !isCount(impressions) || !isCount(clicks) || !isConversions(conversions)) {
    return NextResponse.json({ error: "Informe campaign_id, date (AAAA-MM-DD), impressions, clicks e conversions válidos." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Integração indisponível." }, { status: 503 });

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc("marketing_ingest_campaign_report", {
    p_token: token, p_campaign_id: campaign_id, p_report_date: date,
    p_impressions: impressions, p_clicks: clicks, p_conversions: conversions,
  }).abortSignal(AbortSignal.timeout(10000));
  if (error) return NextResponse.json({ error: "Não foi possível gravar o relatório." }, { status: 503 });
  if (data === "unauthorized") return NextResponse.json({ error: "Chave da integração inválida." }, { status: 401 });
  if (data === "campaign_not_found") return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  if (data !== "ok") return NextResponse.json({ error: "Integração indisponível." }, { status: 503 });
  return NextResponse.json({ ok: true, campaign_id, date });
}
