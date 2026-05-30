-- ══════════════════════════════════════════════════════════════
-- FIX COMPLETO: RLS do Chat — v2
-- Correções:
--   1. ch_select: inclui created_by para o criador ver o canal
--      antes de virar membro (fix do erro ao abrir DM)
--   2. msg_delete: admin pode apagar mensagem completamente (hard delete)
--   3. cm_select: usa função security definer (sem recursão)
--   4. Realtime habilitado
-- Rodar no Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Função security definer — evita recursão na verificação de membro
CREATE OR REPLACE FUNCTION public.is_chat_member(channel_uuid UUID)
RETURNS BOOLEAN SECURITY DEFINER STABLE LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE channel_id = channel_uuid AND user_id = auth.uid()
  );
$$;

-- 2. Policies de chat_channels
DROP POLICY IF EXISTS "ch_select" ON chat_channels;
DROP POLICY IF EXISTS "ch_insert" ON chat_channels;

-- CORREÇÃO PRINCIPAL DO DM: created_by = auth.uid() permite que o criador
-- veja o canal recém-criado antes de inserir os membros (.insert().select())
CREATE POLICY "ch_select" ON chat_channels
  FOR SELECT TO authenticated
  USING (
    type = 'public'
    OR created_by = auth.uid()
    OR is_chat_member(id)
  );

CREATE POLICY "ch_insert" ON chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Policies de chat_members
DROP POLICY IF EXISTS "cm_select" ON chat_members;
DROP POLICY IF EXISTS "cm_insert" ON chat_members;

CREATE POLICY "cm_select" ON chat_members
  FOR SELECT TO authenticated
  USING (is_chat_member(channel_id));

CREATE POLICY "cm_insert" ON chat_members
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 4. Policies de chat_messages
DROP POLICY IF EXISTS "msg_select" ON chat_messages;
DROP POLICY IF EXISTS "msg_insert" ON chat_messages;
DROP POLICY IF EXISTS "msg_update" ON chat_messages;
DROP POLICY IF EXISTS "msg_delete" ON chat_messages;

CREATE POLICY "msg_select" ON chat_messages
  FOR SELECT TO authenticated
  USING (
    (
      EXISTS (SELECT 1 FROM chat_channels WHERE id = channel_id AND type = 'public')
      OR is_chat_member(channel_id)
    )
    AND (status = 'sent' OR is_admin())
  );

CREATE POLICY "msg_insert" ON chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "msg_update" ON chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR is_admin())
  WITH CHECK (sender_id = auth.uid() OR is_admin());

-- Hard delete: somente admin apaga o registro inteiro
CREATE POLICY "msg_delete" ON chat_messages
  FOR DELETE TO authenticated
  USING (is_admin());

-- 5. Realtime
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
END $$;

-- 6. Garantir canal #geral
INSERT INTO chat_channels (type, name)
SELECT 'public', '#geral'
WHERE NOT EXISTS (
  SELECT 1 FROM chat_channels WHERE type = 'public' AND name = '#geral'
);
