import { NextResponse } from "next/server";
import { createAdminServerClient, createScopedServerClient } from "@/lib/server-supabase";

const INVITABLE_ROLES = ["admin", "sales", "marketing", "analyst"];

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!organizationId || !/^\S+@\S+\.\S+$/.test(email) || !INVITABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Confira o e-mail e o perfil escolhido." }, { status: 400 });
  }

  try {
    const scoped = createScopedServerClient(token);
    const { data: auth, error: authError } = await scoped.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const { data: membership } = await scoped.from("marketing_memberships")
      .select("role").eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Somente proprietários e administradores podem convidar pessoas." }, { status: 403 });
    }

    const admin = createAdminServerClient();
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: process.env.NEXT_PUBLIC_APP_URL || undefined,
    });
    if (inviteError || !invitation.user) {
      return NextResponse.json({ error: inviteError?.message || "Não foi possível enviar o convite." }, { status: 400 });
    }
    const { error: membershipError } = await admin.from("marketing_memberships").upsert({
      organization_id: organizationId,
      user_id: invitation.user.id,
      email,
      role,
      created_by: auth.user.id,
    }, { onConflict: "organization_id,user_id" });
    if (membershipError) return NextResponse.json({ error: "O convite foi criado, mas não foi possível atribuir o perfil." }, { status: 500 });
    return NextResponse.json({ success: true, message: `Convite enviado para ${email}.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir o convite.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

