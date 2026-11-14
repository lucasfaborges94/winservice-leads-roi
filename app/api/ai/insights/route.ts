import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createScopedServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Configure OPENAI_API_KEY no servidor para habilitar as análises com IA." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  if (!organizationId) return NextResponse.json({ error: "Organização inválida." }, { status: 400 });

  const supabase = createScopedServerClient(token);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: membership } = await supabase.from("marketing_memberships")
    .select("role").eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle();
  let canAnalyze = Boolean(membership && ["owner", "admin", "marketing", "analyst", "traffic_manager"].includes(membership.role));
  if (membership?.role.startsWith("custom:")) {
    const { data: customRole } = await supabase.from("marketing_custom_roles")
      .select("permissions").eq("role_key", membership.role).maybeSingle();
    canAnalyze = Boolean(customRole?.permissions?.some((permission: string) => ["analytics", "campaign_manage"].includes(permission)));
  }
  if (!canAnalyze) {
    return NextResponse.json({ error: "Seu perfil não tem acesso à análise de campanhas." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("marketing_dashboard", { p_organization_id: organizationId });
  if (error) return NextResponse.json({ error: "Não foi possível carregar os indicadores da organização." }, { status: 400 });

  try {
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await ai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-6-astra",
      input: [
        { role: "developer", content: [
        "Você é um analista de marketing e vendas para uma assistência técnica local.",
        "Analise os dados agregados abaixo e responda em português do Brasil, em até 6 tópicos curtos.",
        "Priorize gargalos do funil, custo por lead/qualificado/cliente, receita, retorno sobre investimento e ações práticas.",
        "Não invente dados. Se faltarem gastos ou receita, diga o que precisa ser preenchido.",
        "Os dados não contêm nomes, telefones, e-mails nem observações privadas.",
        ].join("\n\n") },
        { role: "user", content: JSON.stringify(data) },
      ],
    });
    const analysis = response.output_text;
    return NextResponse.json({ analysis: analysis || "Não foi possível gerar uma análise." });
  } catch {
    return NextResponse.json({ error: "A OpenAI não respondeu. Confira a chave e o acesso à API." }, { status: 502 });
  }
}
