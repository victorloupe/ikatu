// Supabase Edge Function: gmail-proxy
// Proxy seguro para todas as chamadas à Gmail API.
// O access_token nunca vai ao cliente — apenas esta função o usa.
//
// Fluxo:
//  1. Recebe { action, params } via POST
//  2. Valida JWT do usuário
//  3. Busca e atualiza o access_token (com refresh automático)
//  4. Executa a chamada Gmail API e retorna o resultado
//
// Ações suportadas:
//   listMessages, getMessage, getAttachment, sendMessage, modifyMessage
//
// Deploy:  supabase functions deploy gmail-proxy

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

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("user_gmail_tokens")
    .select("access_token, refresh_token, token_expiry")
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error("Gmail não conectado. Conecte seu Gmail primeiro.");

  const expiresAt = new Date(data.token_expiry).getTime();
  const needsRefresh = expiresAt - Date.now() < 5 * 60 * 1000;

  if (!needsRefresh) return data.access_token;

  if (!data.refresh_token) throw new Error("Token expirado. Reconecte o Gmail.");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await resp.json();
  if (tokens.error) throw new Error("Token expirado. Reconecte o Gmail.");

  const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("user_gmail_tokens")
    .update({ access_token: tokens.access_token, token_expiry: newExpiry, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return tokens.access_token;
}

async function gmailFetch(
  accessToken: string,
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  return fetch(`https://gmail.googleapis.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
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

    const { action, params = {} } = await req.json() as { action: string; params: Record<string, unknown> };

    const accessToken = await getValidAccessToken(supabase, user.id);

    // ── listMessages ───────────────────────────────────────────────
    if (action === "listMessages") {
      const labelId = params.labelId ? String(params.labelId) : "INBOX";
      const qp = new URLSearchParams({ maxResults: "30" });
      if (labelId) qp.set("labelIds", labelId);
      if (params.pageToken) qp.set("pageToken", String(params.pageToken));
      if (params.q) qp.set("q", String(params.q));
      const r = await gmailFetch(accessToken, `/gmail/v1/users/me/messages?${qp}`);
      const data = await r.json();
      return json(data, r.status);
    }

    // ── listLabels ─────────────────────────────────────────────────
    if (action === "listLabels") {
      const r = await gmailFetch(accessToken, `/gmail/v1/users/me/labels`);
      const data = await r.json();
      return json(data, r.status);
    }

    // ── getMessage ─────────────────────────────────────────────────
    if (action === "getMessage") {
      const id = String(params.messageId || "");
      const format = String(params.format || "full");
      let path = `/gmail/v1/users/me/messages/${id}?format=${format}`;
      if (params.metadataHeaders && Array.isArray(params.metadataHeaders)) {
        for (const h of params.metadataHeaders) {
          path += `&metadataHeaders=${encodeURIComponent(String(h))}`;
        }
      }
      const r = await gmailFetch(accessToken, path);
      const data = await r.json();
      return json(data, r.status);
    }

    // ── getAttachment ──────────────────────────────────────────────
    if (action === "getAttachment") {
      const msgId = String(params.messageId || "");
      const attId = String(params.attachmentId || "");
      const r = await gmailFetch(accessToken, `/gmail/v1/users/me/messages/${msgId}/attachments/${attId}`);
      const data = await r.json();
      return json(data, r.status);
    }

    // ── sendMessage ────────────────────────────────────────────────
    if (action === "sendMessage") {
      const body: Record<string, unknown> = { raw: params.raw };
      if (params.threadId) body.threadId = params.threadId;
      const r = await gmailFetch(accessToken, "/gmail/v1/users/me/messages/send", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await r.json();
      return json(data, r.status);
    }

    // ── modifyMessage ──────────────────────────────────────────────
    if (action === "modifyMessage") {
      const id = String(params.messageId || "");
      const body = {
        addLabelIds: params.addLabelIds || [],
        removeLabelIds: params.removeLabelIds || [],
      };
      const r = await gmailFetch(accessToken, `/gmail/v1/users/me/messages/${id}/modify`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await r.json();
      return json(data, r.status);
    }

    // ── checkConnection ────────────────────────────────────────────
    if (action === "checkConnection") {
      const { data: tokenRow } = await supabase
        .from("user_gmail_tokens")
        .select("gmail_email")
        .eq("user_id", user.id)
        .single();
      return json({ connected: !!tokenRow, email: tokenRow?.gmail_email || null });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    const status = msg.includes("Reconecte") || msg.includes("não conectado") ? 401 : 500;
    return json({ error: msg }, status);
  }
});
