// Supabase Edge Function: invite-user
// Convida um novo usuário por e-mail preenchendo os metadados do profile.
// Apenas administradores autenticados e ativos podem chamar esta função.
//
// Deploy:  supabase functions deploy invite-user
// Secrets: (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetados automaticamente)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Variáveis de ambiente ausentes no servidor." }, 500);
    }

    // 1. Validar autenticação do usuário que está chamando (precisa ser ADMIN)
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Sem token de autenticação." }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validar token e obter dados do usuário logado
    const { data: { user }, error: uErr } = await supabase.auth.getUser(jwt);
    if (uErr || !user) return json({ error: "Usuário inválido ou sessão expirada." }, 401);

    // Verificar se o usuário logado é administrador ativo
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .single();

    if (pErr || !profile || profile.role !== "admin" || !profile.active) {
      return json({ error: "Apenas administradores ativos podem convidar novos usuários." }, 403);
    }

    // 2. Extrair dados da requisição
    const { email, name } = await req.json();
    if (!email) {
      return json({ error: "O e-mail é obrigatório." }, 400);
    }

    // 3. Convidar o usuário usando o auth.admin API (service_role)
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: { name: name || "" }
      }
    );

    if (inviteErr) {
      return json({ error: inviteErr.message }, 400);
    }

    return json({ message: "Usuário convidado com sucesso!", user: inviteData.user });
  } catch (e: any) {
    return json({ error: e.message || "Erro inesperado no servidor." }, 500);
  }
});
