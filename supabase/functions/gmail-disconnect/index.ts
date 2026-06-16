// Supabase Edge Function: gmail-disconnect
// Revoga os tokens OAuth do Google e remove o registro do banco.
//
// Deploy:  supabase functions deploy gmail-disconnect

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Configuração ausente." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Sem token de autenticação." }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: uErr } = await supabase.auth.getUser(jwt);
    if (uErr || !user) return json({ error: "Usuário inválido." }, 401);

    // Busca o refresh_token para revogar
    const { data: tokenRow } = await supabase
      .from("user_gmail_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .single();

    if (tokenRow?.refresh_token) {
      // Tenta revogar (best-effort, ignora erros)
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenRow.refresh_token)}`,
        { method: "POST" }
      ).catch(() => {});
    }

    // Remove o registro do banco
    await supabase.from("user_gmail_tokens").delete().eq("user_id", user.id);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
