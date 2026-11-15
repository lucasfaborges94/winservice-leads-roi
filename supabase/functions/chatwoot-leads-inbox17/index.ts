Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const secret = Deno.env.get("CHATWOOT_LEADS_WEBHOOK_SECRET");
  const org = Deno.env.get("LEADS_ROI_ORGANIZATION_ID");
  const actor = Deno.env.get("LEADS_ROI_CREATED_BY");
  const timestamp = request.headers.get("x-chatwoot-timestamp") ?? "";
  const signature = request.headers.get("x-chatwoot-signature") ?? "";
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^sha256=[a-f0-9]{64}$/.test(signature)) return new Response(null, { status: 401 });
  if (!secret || !org || !actor) return new Response(null, { status: 503 });
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > 2_000_000) return new Response(null, { status: 413 });
  const encoder = new TextEncoder();
  const prefix = encoder.encode(timestamp + ".");
  const message = new Uint8Array(prefix.length + raw.length);
  message.set(prefix);
  message.set(raw, prefix.length);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const mac = Uint8Array.from(signature.slice(7).match(/../g)!, (byte) => parseInt(byte, 16));
  if (!await crypto.subtle.verify("HMAC", key, mac, message)) return new Response(null, { status: 401 });
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { return new Response(null, { status: 400 }); }
  if (!payload || typeof payload !== "object") return new Response(null, { status: 400 });
  const conversation = String(payload.conversation?.id ?? "");
  const inbox = String(payload.inbox?.id ?? payload.conversation?.inbox_id ?? "");
  if (payload.event !== "message_created" || inbox !== "17" || !["incoming", 0].includes(payload.message_type) || payload.private === true || !/^[1-9]\d{0,15}$/.test(conversation)) return new Response(null, { status: 204 });
  const phone = String(payload.sender?.phone_number ?? "").replace(/[^\d+]/g, "");
  if (!/^\+?\d{8,15}$/.test(phone)) return new Response(null, { status: 204 });
  const timestampMs = typeof payload.created_at === "number" ? payload.created_at * 1000 : Date.parse(payload.created_at);
  const id = "37f1c8a0-f436-4017-" + conversation.padStart(16, "0").replace(/^(....)/, "$1-");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response(null, { status: 503 });
  let campaign: { id: string; platform: string } | undefined;
  const content = payload.content;
  if (typeof content === "string" && content.length > 0 && content.length <= 2000) {
    const query = new URLSearchParams({
      select: "id,platform,expected_whatsapp_message",
      organization_id: "eq." + org,
      expected_whatsapp_message: "eq." + content,
      limit: "2",
    });
    const matches = await fetch(url + "/rest/v1/marketing_campaigns?" + query, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
    });
    if (!matches.ok) return new Response(null, { status: 503 });
    const rows = await matches.json();
    if (rows.length === 1 && rows[0].expected_whatsapp_message === content) campaign = rows[0];
  }
  const result = await fetch(url + "/rest/v1/marketing_leads?on_conflict=id", {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ id, organization_id: org, created_by: actor, full_name: String(payload.sender?.name ?? "").trim().slice(0, 200) || phone, phone, preferred_contact_channel: "WhatsApp", campaign_id: campaign?.id ?? null, acquisition_source: campaign?.platform === "Orgânico" ? "Busca orgânica" : campaign?.platform ?? "Desconhecido", first_contact_at: new Date(Number.isFinite(timestampMs) && Math.abs(timestampMs) <= 8640000000000000 ? timestampMs : Date.now()).toISOString() }),
  });
  if (!result.ok) {
    console.error("Lead intake insert failed", result.status);
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204 });
});


