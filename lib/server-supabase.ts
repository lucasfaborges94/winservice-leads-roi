import { createClient } from "@supabase/supabase-js";

export function createScopedServerClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase ausente.");
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAdminServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_SECRET_KEY não configurada no servidor.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

