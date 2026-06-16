// Supabase Edge Function: gmail-oauth-start
// Gera a URL de autorização do Google OAuth para o usuário iniciar a conexão Gmail.
//
// Fluxo:
//  1. Recebe o JWT do usuário (Authorization: Bearer <access_token>)
//  2. Valida o usuário via Supabase (service role)
//  3. Gera a URL de autorização Google com state=<base64(userId)>
//  4. Retorna { url } para o cliente abrir em popup
//
// Deploy:  supabase functions deploy gmail-oauth-start
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_OAUTH_REDIRECT_URI
//          (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetados automaticamente)

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GMAIL_OAUTH_REDIRECT_URI = Deno.env.get("GMAIL_OAUTH_REDIRECT_URI");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GOOGLE_CLIENT_ID || !GMAIL_OAUTH_REDIRECT_URI || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Variáveis de ambiente ausentes no servidor." }, 500);
    }

    // Valida o usuário via JWT
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Sem token de autenticação." }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: uErr } = await supabase.auth.getUser(jwt);
    if (uErr || !user) return json({ error: "Usuário inválido." }, 401);

    // Codifica o userId no state para recuperar no callback
    const state = btoa(user.id);

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GMAIL_OAUTH_REDIRECT_URI,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return json({ url });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
