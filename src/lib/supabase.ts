import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Cliente Supabase com a service_role key.
 *
 * Ignora RLS, então SÓ pode ser usado em código de servidor (route handlers e
 * server components). Nunca importe isto de um arquivo com "use client".
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidas. " +
        "Copie .env.example para .env.local (local) ou configure em " +
        "Project Settings > Environment Variables na Vercel (produção).",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
