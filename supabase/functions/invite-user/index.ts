// Supabase Edge Function: invite-user
// Cria um usuário com senha (direto, já confirmado), convida por e-mail
// ou exclui um usuário com todas as pranchas e imagens (action: "delete").
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

const BUCKET = "igui-files";

// Lista recursivamente todos os arquivos de uma pasta do Storage
async function listarArquivos(sb: any, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const it of data) {
      const path = `${prefix}/${it.name}`;
      if (it.id === null) out.push(...await listarArquivos(sb, path)); // subpasta
      else out.push(path);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
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
      return json({ error: "Apenas administradores ativos podem gerenciar usuários." }, 403);
    }

    // 2. Extrair dados da requisição
    const body = await req.json().catch(() => ({}));

    // ── Excluir usuário (conta + pranchas + imagens) ──
    if (body.action === "delete") {
      const userId = String(body.userId || "");
      if (!userId) return json({ error: "Usuário não informado." }, 400);
      if (userId === user.id) return json({ error: "Você não pode excluir a sua própria conta." }, 400);

      // Imagens no Storage (pasta <userId>/...)
      const arquivos = await listarArquivos(supabase, userId);
      for (let i = 0; i < arquivos.length; i += 100) {
        await supabase.storage.from(BUCKET).remove(arquivos.slice(i, i + 100));
      }

      // Pranchas (também cairiam no cascade, mas apagamos explicitamente)
      const { count: projetos } = await supabase.from("projects")
        .delete({ count: "exact" }).eq("user_id", userId);

      // Conta (profile, pagamentos, sugestões etc. caem por ON DELETE CASCADE)
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) return json({ error: delErr.message }, 400);

      return json({ message: "Usuário excluído.", projetos: projetos || 0, arquivos: arquivos.length });
    }

    let email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    if (!email) return json({ error: "O e-mail ou usuário é obrigatório." }, 400);
    if (!email.includes("@")) email = `${email}@igui.com`;

    // 3a. Com senha: cria o usuário já confirmado (entra direto, sem e-mail)
    if (password) {
      if (password.length < 6) {
        return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      }
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (createErr) {
        const msg = /already|registered|exists/i.test(createErr.message)
          ? "Já existe um usuário com este e-mail/usuário."
          : createErr.message;
        return json({ error: msg }, 400);
      }
      // Garante o profile (caso o trigger não tenha rodado)
      await supabase.from("profiles").upsert({
        id: created.user.id,
        email,
        name: name || email.split("@")[0],
        role: "user",
        active: true,
      }, { onConflict: "id", ignoreDuplicates: true });

      return json({ message: "Usuário criado com sucesso!", mode: "created", user: created.user });
    }

    // 3b. Sem senha: envia convite por e-mail (precisa ser um e-mail real)
    if (email.endsWith("@igui.com")) {
      return json({ error: "Para usuários @igui.com informe uma senha." }, 400);
    }
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      email,
      { data: { name } },
    );
    if (inviteErr) return json({ error: inviteErr.message }, 400);

    return json({ message: "Convite enviado!", mode: "invited", user: inviteData.user });
  } catch (e: any) {
    return json({ error: e.message || "Erro inesperado no servidor." }, 500);
  }
});
