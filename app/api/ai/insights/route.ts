import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createScopedServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "Configure a chave do Google AI Studio no servidor." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  if (!organizationId) return NextResponse.json({ error: "Organização inválida." }, { status: 400 });

  const supabase = createScopedServerClient(token);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: membership } = await supabase.from("marketing_memberships")
    .select("role").eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership || !["owner", "admin", "marketing", "analyst"].includes(membership.role)) {
    return NextResponse.json({ error: "Seu perfil não tem acesso à análise de campanhas." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("marketing_dashboard", { p_organization_id: organizationId });
  if (error) return NextResponse.json({ error: "Não foi possível carregar os indicadores da organização." }, { status: 400 });

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.interactions.create({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      input: [
        "Você é um analista de marketing e vendas para uma assistência técnica local.",
        "Analise os dados agregados abaixo e responda em português do Brasil, em até 6 tópicos curtos.",
        "Priorize gargalos do funil, custo por lead/qualificado/cliente, receita, retorno sobre investimento e ações práticas.",
        "Não invente dados. Se faltarem gastos ou receita, diga o que precisa ser preenchido.",
        "Os dados não contêm nomes, telefones, e-mails nem observações privadas.",
        JSON.stringify(data),
      ].join("\n\n"),
    });
    const analysis = (response.outputs || [])
      .filter((output) => output.type === "text")
      .map((output) => output.text || "")
      .filter(Boolean)
      .join("\n");
    return NextResponse.json({ analysis: analysis || "Não foi possível gerar uma análise." });
  } catch {
    return NextResponse.json({ error: "O Google AI Studio não respondeu. Confira a chave e o acesso à API." }, { status: 502 });
  }
}

