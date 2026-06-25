// Supabase Edge Function: backup-pagamentos
// Exporta todos os registros da tabela `payments` como JSON
// e salva no Storage em: backups/pagamentos/YYYY-MM-DD.json
//
// Agendamento: todo dia 1º às 03:00 UTC (via pg_cron — ver README abaixo)
// Trigger manual: POST /functions/v1/backup-pagamentos
//   Header: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// Deploy: supabase functions deploy backup-pagamentos
// O bucket "backups" precisa existir no Storage (criar pelo Dashboard, privado).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Aceita: trigger do pg_cron (sem header) ou chamada manual com service role
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (token && token !== SERVICE_ROLE) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), { status: 401 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Lê todos os registros de pagamentos
    const { data: payments, error } = await sb
      .from("payments")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    // 2. Monta o JSON com metadados
    const payload = {
      gerado_em: new Date().toISOString(),
      total_registros: payments?.length ?? 0,
      payments,
    };
    const json = JSON.stringify(payload, null, 2);

    // 3. Nome do arquivo: YYYY-MM-DD.json
    const hoje = new Date().toISOString().slice(0, 10);
    const path = `pagamentos/${hoje}.json`;

    // 4. Upload para o bucket "backups" (sobrescreve se já existir)
    const { error: upErr } = await sb.storage
      .from("backups")
      .upload(path, new Blob([json], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
      });

    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({ ok: true, arquivo: path, registros: payments?.length ?? 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message || e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/*
══════════════════════════════════════════════════════
SETUP — faça isso uma vez pelo Dashboard do Supabase
══════════════════════════════════════════════════════

1. BUCKET
   Storage → New bucket → Nome: "backups" → Private (desmarcar "Public")

2. DEPLOY DA FUNÇÃO
   supabase functions deploy backup-pagamentos

3. AGENDAMENTO via pg_cron (SQL Editor no Dashboard)

   -- Habilitar extensão (só precisa rodar uma vez)
   CREATE EXTENSION IF NOT EXISTS pg_cron;

   -- Agendar: todo dia 1º do mês às 03:00 UTC
   SELECT cron.schedule(
     'backup-pagamentos-mensal',
     '0 3 1 * *',
     $$
     SELECT net.http_post(
       url    := current_setting('app.supabase_url') || '/functions/v1/backup-pagamentos',
       body   := '{}'::jsonb,
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
       )
     );
     $$
   );

   -- Para ver os agendamentos ativos:
   SELECT * FROM cron.job;

   -- Para remover:
   SELECT cron.unschedule('backup-pagamentos-mensal');

4. CONFIGURAR as settings do pg_cron com suas chaves
   (Dashboard → Settings → Database → Extensions → pg_cron)
   Ou via SQL:
   ALTER DATABASE postgres SET app.supabase_url = 'https://SEU-ID.supabase.co';
   ALTER DATABASE postgres SET app.service_role_key = 'SUA_SERVICE_ROLE_KEY';

5. TESTE MANUAL
   curl -X POST https://SEU-ID.supabase.co/functions/v1/backup-pagamentos \
     -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"

   Os backups ficam em: Storage → backups/pagamentos/YYYY-MM-DD.json
══════════════════════════════════════════════════════
*/
