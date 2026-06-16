// Supabase Edge Function: gmail-oauth-callback
// Recebe o código de autorização do Google, troca por tokens e salva no banco.
//
// Fluxo:
//  1. Google redireciona para esta URL com ?code=xxx&state=yyy (base64 do userId)
//  2. Troca o code por access_token + refresh_token
//  3. Busca o email do usuário via Gmail API
//  4. Salva os tokens em user_gmail_tokens via service role
//  5. Retorna HTML que fecha o popup e notifica a janela pai via postMessage
//
// Deploy:  supabase functions deploy gmail-oauth-callback
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_OAUTH_REDIRECT_URI

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const htmlClose = (type: string, payload: Record<string, string>) => {
    const data = JSON.stringify({ type, ...payload });
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Autorizando Gmail...</title></head><body>
      <script>
        try { window.opener.postMessage(${data}, '*'); } catch(e) {}
        window.close();
        setTimeout(() => { document.body.innerHTML = '<p>Pode fechar esta janela.</p>'; }, 500);
      <\/script>
      <p style="font-family:sans-serif;color:#555;padding:40px;text-align:center;">Conectando Gmail...</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=UTF-8" } }
    );
  };

  if (errorParam) {
    return htmlClose("gmail-oauth-error", { error: errorParam });
  }

  if (!code || !state) {
    return htmlClose("gmail-oauth-error", { error: "Parâmetros inválidos." });
  }

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const GMAIL_OAUTH_REDIRECT_URI = Deno.env.get("GMAIL_OAUTH_REDIRECT_URI");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GMAIL_OAUTH_REDIRECT_URI || !SUPABASE_URL || !SERVICE_ROLE) {
      return htmlClose("gmail-oauth-error", { error: "Configuração ausente no servidor." });
    }

    // Decodifica userId do state
    let userId: string;
    try {
      userId = atob(state);
    } catch {
      return htmlClose("gmail-oauth-error", { error: "State inválido." });
    }

    // Troca o code por tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GMAIL_OAUTH_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResp.json();
    if (tokens.error) {
      return htmlClose("gmail-oauth-error", { error: tokens.error_description || tokens.error });
    }

    const { access_token, refresh_token, expires_in } = tokens;
    const tokenExpiry = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // Busca o endereço Gmail do usuário
    const profileResp = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileResp.json();
    const gmailEmail = profile.emailAddress || "";

    // Salva no banco (upsert por user_id)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const upsertData: Record<string, unknown> = {
      user_id: userId,
      access_token,
      token_expiry: tokenExpiry,
      gmail_email: gmailEmail,
      updated_at: new Date().toISOString(),
    };
    // Só sobrescreve o refresh_token se Google enviou um novo
    if (refresh_token) upsertData.refresh_token = refresh_token;

    const { error: dbErr } = await supabase
      .from("user_gmail_tokens")
      .upsert(upsertData, { onConflict: "user_id" });

    if (dbErr) {
      return htmlClose("gmail-oauth-error", { error: "Falha ao salvar tokens: " + dbErr.message });
    }

    return htmlClose("gmail-oauth-success", { email: gmailEmail });
  } catch (e) {
    return htmlClose("gmail-oauth-error", { error: String((e as Error)?.message || e) });
  }
});
