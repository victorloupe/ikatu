// Supabase Edge Function: stream-token
// Gera um token do GetStream Chat para o usuário logado no Supabase.
// O API Secret do Stream fica SOMENTE aqui (servidor), nunca no cliente.
//
// Fluxo:
//  1. Recebe o JWT do usuário (Authorization: Bearer <access_token>)
//  2. Valida o usuário via Supabase (service role)
//  3. Sincroniza (upsert) todos os profiles como usuários no Stream
//     (assim os nomes/avatares aparecem corretos para todo mundo)
//  4. Devolve { token, apiKey, userId } para o cliente conectar
//
// Deploy:  supabase functions deploy stream-token
// Secrets: supabase secrets set STREAM_API_KEY=xxx STREAM_API_SECRET=yyy
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetados automaticamente)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { StreamChat } from "https://esm.sh/stream-chat@8";

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
    const STREAM_API_KEY = Deno.env.get("STREAM_API_KEY");
    const STREAM_API_SECRET = Deno.env.get("STREAM_API_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!STREAM_API_KEY || !STREAM_API_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Variáveis de ambiente ausentes no servidor." }, 500);
    }

    // 1. Token do usuário logado
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Sem token de autenticação." }, 401);

    // 2. Valida o usuário
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: uErr } = await supabase.auth.getUser(jwt);
    if (uErr || !user) return json({ error: "Usuário inválido." }, 401);

    // 3. Sincroniza todos os profiles no Stream
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,name,role,active");

    const server = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);

    const users = (profiles || [])
      .filter((p: any) => p && p.id)
      .map((p: any) => ({
        id: String(p.id),
        name: p.name || "Usuário",
        role: p.role === "admin" ? "admin" : "user",
        igui_role: p.role || "user",
        active: p.active !== false,
      }));

    if (users.length) {
      await server.upsertUsers(users);
    } else {
      // garante ao menos o próprio usuário
      await server.upsertUser({ id: user.id, name: user.email || "Usuário" });
    }

    // 4. Canal "Geral" da equipe (grupo com todos) — idempotente
    const allIds = users.map((u: any) => u.id);
    if (!allIds.includes(user.id)) allIds.push(user.id);
    if (allIds.length) {
      try {
        const geral = server.channel("messaging", "geral", {
          name: "Geral",
          created_by_id: user.id,
          members: allIds,
        });
        await geral.create();
      } catch (_) { /* já existe */ }
      // garante que todo mundo (inclusive novos colegas) está no canal
      try {
        await server.channel("messaging", "geral").addMembers(allIds);
      } catch (_) { /* ok */ }
    }

    // 5. Token do Stream para este usuário
    const token = server.createToken(user.id);

    return json({ token, apiKey: STREAM_API_KEY, userId: user.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
