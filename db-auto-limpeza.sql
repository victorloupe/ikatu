-- ══════════════════════════════════════════════════════════════
-- Auto-limpeza de mensagens do #geral — pg_cron
-- Remove mensagens do canal público com mais de 60 dias.
-- DMs nunca são apagados.
-- Rodar UMA VEZ no Supabase SQL Editor para ativar.
-- ══════════════════════════════════════════════════════════════

-- 1. Função que realiza a limpeza
CREATE OR REPLACE FUNCTION public.limpar_msgs_antigas()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.chat_messages
  WHERE created_at < now() - interval '60 days'
    AND channel_id IN (
      SELECT id FROM public.chat_channels WHERE type = 'public'
    );
END;
$$;

-- 2. Agendar via pg_cron: roda todo dia 1 às 03:00 (UTC)
--    O job só deleta algo quando há mensagens com +60 dias;
--    caso contrário, termina em milissegundos sem custo.
SELECT cron.schedule(
  'igui-limpar-msgs-geral',       -- nome único do job
  '0 3 1 * *',                    -- cron: dia 1 de cada mês, 03h00 UTC
  $$ SELECT public.limpar_msgs_antigas(); $$
);

-- ── Para consultar os jobs ativos ─────────────────────────────
-- SELECT * FROM cron.job;

-- ── Para cancelar o job (se precisar) ────────────────────────
-- SELECT cron.unschedule('igui-limpar-msgs-geral');
