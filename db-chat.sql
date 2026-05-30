-- ─────────────────────────────────────────────────────────────
-- iGUi Space — Chat Schema
-- Execute no Supabase SQL Editor (projeto: dogyxhfoopiefujyqqyq)
-- ─────────────────────────────────────────────────────────────

-- Tabela: canais (público #geral + DMs)
CREATE TABLE IF NOT EXISTS chat_channels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL CHECK (type IN ('public', 'dm')),
  name       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela: membros de DMs
CREATE TABLE IF NOT EXISTS chat_members (
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);

-- Tabela: mensagens (enviadas + agendadas)
CREATE TABLE IF NOT EXISTS chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name  TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'scheduled')),
  scheduled_at TIMESTAMPTZ,
  pinned       BOOLEAN NOT NULL DEFAULT false,
  pin_until    TIMESTAMPTZ,
  deleted      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chat_msgs_channel_ts
  ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user
  ON chat_members(user_id);

-- Realtime: publicar todas as mudanças de linha
ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- profiles: permitir leitura básica para todos os autenticados (necessário para lista de DMs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'profiles_chat_read'
  ) THEN
    CREATE POLICY "profiles_chat_read" ON profiles
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- chat_channels: leitura de canais públicos + DMs do usuário
CREATE POLICY "ch_select" ON chat_channels
  FOR SELECT TO authenticated
  USING (
    type = 'public'
    OR EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.channel_id = chat_channels.id
        AND chat_members.user_id = auth.uid()
    )
  );

CREATE POLICY "ch_insert" ON chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- chat_members: ver membros dos canais em que participa
CREATE POLICY "cm_select" ON chat_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_members cm2
      WHERE cm2.channel_id = chat_members.channel_id
        AND cm2.user_id = auth.uid()
    )
  );

CREATE POLICY "cm_insert" ON chat_members
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- chat_messages: SELECT
-- Canal público: todos veem mensagens 'sent'; admin vê também 'scheduled'
-- DM: membros veem mensagens 'sent'; admin vê 'scheduled'
CREATE POLICY "msg_select" ON chat_messages
  FOR SELECT TO authenticated
  USING (
    (status = 'sent' AND (
      EXISTS (SELECT 1 FROM chat_channels WHERE id = channel_id AND type = 'public')
      OR EXISTS (
        SELECT 1 FROM chat_members
        WHERE chat_members.channel_id = chat_messages.channel_id
          AND chat_members.user_id = auth.uid()
      )
    ))
    OR (status = 'scheduled' AND is_admin())
  );

-- chat_messages: INSERT — usuário autenticado, só como próprio sender
CREATE POLICY "msg_insert" ON chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- chat_messages: UPDATE — próprio sender (soft delete) ou admin (qualquer)
CREATE POLICY "msg_update" ON chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR is_admin())
  WITH CHECK (sender_id = auth.uid() OR is_admin());

-- ─────────────────────────────────────────────────────────────
-- Seed: canal #geral (idempotente)
-- ─────────────────────────────────────────────────────────────
INSERT INTO chat_channels (type, name)
SELECT 'public', '#geral'
WHERE NOT EXISTS (
  SELECT 1 FROM chat_channels WHERE type = 'public' AND name = '#geral'
);
