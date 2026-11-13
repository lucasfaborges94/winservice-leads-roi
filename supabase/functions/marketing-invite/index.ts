import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INVITABLE_ROLES = ["admin", "sales", "marketing", "analyst"];
const APP_URL = "https://evolution-leads-roi.huvyyz.easypanel.host";

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Método não permitido." }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return respond({ error: "Faça login para continuar." }, 401);

  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!organizationId || !/^\S+@\S+\.\S+$/.test(email) || !INVITABLE_ROLES.includes(role)) {
    return respond({ error: "Confira o e-mail e o perfil escolhido." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond({ error: "A função de convite não está configurada no Supabase." }, 503);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: auth, error: authError } = await callerClient.auth.getUser();
  if (authError || !auth.user) return respond({ error: "Sessão inválida." }, 401);

  const { data: membership } = await callerClient.from("marketing_memberships")
    .select("role").eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return respond({ error: "Somente proprietários e administradores podem convidar pessoas." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: APP_URL,
  });
  if (inviteError || !invitation.user) {
    return respond({ error: inviteError?.message || "Não foi possível enviar o convite." }, 400);
  }

  const { error: membershipError } = await adminClient.from("marketing_memberships").upsert({
    organization_id: organizationId,
    user_id: invitation.user.id,
    email,
    role,
    created_by: auth.user.id,
  }, { onConflict: "organization_id,user_id" });
  if (membershipError) {
    return respond({ error: "O convite foi criado, mas não foi possível atribuir o perfil." }, 500);
  }

  return respond({ success: true, message: `Convite enviado para ${email}.` });
});
