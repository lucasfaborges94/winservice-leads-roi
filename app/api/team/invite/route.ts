import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Configuração do Supabase ausente." }, { status: 503 });

  try {
    const response = await fetch(`${url}/functions/v1/marketing-invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({ error: "Resposta inválida do serviço de convites." }));
    return NextResponse.json(result, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Não foi possível conectar ao serviço de convites." }, { status: 503 });
  }
}
