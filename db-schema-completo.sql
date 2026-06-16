-- ══════════════════════════════════════════════════════════════════
-- iGUi Space — SCHEMA CONSOLIDADO (estado final do banco)
-- Gerado em 12/06/2026 a partir de: db-schema, db-chat, db-add-categories,
-- db-payments, db-fix-rls, db-fix-chat-rls, db-performance,
-- db-auto-limpeza e db-reset-password.
--
-- Idempotente: pode rodar inteiro no Supabase SQL Editor sem duplicar nada.
-- Exceção: a seção 9 (pg_cron) requer a extensão pg_cron habilitada.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. FUNÇÕES AUXILIARES
-- ══════════════════════════════════════════════════════════════════

-- Verifica se o usuário é admin ativo.
-- STABLE: resultado cacheado dentro da query (performance nas policies RLS).
-- SECURITY DEFINER: evita recursão de RLS na própria tabela profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND active = true
  );
END;
$$ LANGUAGE plpgsql;

-- updated_at automático (usada por triggers de projects, links e payments)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════════
-- 2. PROFILES (extensão de auth.users)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT,
  name      TEXT,
  role      TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Leitura básica para todos os autenticados (necessária para lista de DMs do chat)
DROP POLICY IF EXISTS "profiles_chat_read" ON profiles;
CREATE POLICY "profiles_chat_read" ON profiles
  FOR SELECT TO authenticated
  USING (true);

-- Índice composto usado pelo is_admin() (id + role + active)
CREATE INDEX IF NOT EXISTS idx_profiles_admin_check
  ON profiles(id, role, active);

-- Trigger: criar profile automaticamente ao criar usuário no auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_role TEXT := 'user';
BEGIN
  IF NEW.email IN ('victorlourencoprojetos@gmail.com', 'projeto@igui.com') THEN
    default_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    default_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ══════════════════════════════════════════════════════════════════
-- 3. PROJECTS (pranchas geradas)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name  TEXT,
  project_code TEXT,
  city         TEXT,
  store        TEXT,
  model        TEXT,
  proj_date    TEXT,
  session_data JSONB NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,
  created_by   TEXT,
  deleted_at   TIMESTAMPTZ,          -- lixeira: data da exclusão (NULL = ativo)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Migração para bancos existentes (idempotente)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Usuário gerencia só os próprios projetos
DROP POLICY IF EXISTS "projects_own" ON projects;
CREATE POLICY "projects_own" ON projects
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin lê todos
DROP POLICY IF EXISTS "projects_admin_all" ON projects;
CREATE POLICY "projects_admin_all" ON projects
  FOR SELECT USING (public.is_admin());

-- Admin escreve em qualquer projeto
DROP POLICY IF EXISTS "projects_admin_write" ON projects;
CREATE POLICY "projects_admin_write" ON projects
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id
  ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at
  ON projects(updated_at DESC);


-- ══════════════════════════════════════════════════════════════════
-- 4. LINKS + CATEGORIAS
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'Geral',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "links_read_all" ON links;
CREATE POLICY "links_read_all" ON links
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "links_admin_insert" ON links;
CREATE POLICY "links_admin_insert" ON links
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "links_admin_update" ON links;
CREATE POLICY "links_admin_update" ON links
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "links_admin_delete" ON links;
CREATE POLICY "links_admin_delete" ON links
  FOR DELETE USING (public.is_admin());

DROP TRIGGER IF EXISTS links_updated_at ON links;
CREATE TRIGGER links_updated_at
  BEFORE UPDATE ON links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Categorias de links
CREATE TABLE IF NOT EXISTS public.link_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  position   INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT link_categories_name_key UNIQUE (name)
);

ALTER TABLE public.link_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "link_categories_read" ON public.link_categories;
CREATE POLICY "link_categories_read" ON public.link_categories
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "link_categories_admin_insert" ON public.link_categories;
CREATE POLICY "link_categories_admin_insert" ON public.link_categories
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "link_categories_admin_update" ON public.link_categories;
CREATE POLICY "link_categories_admin_update" ON public.link_categories
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "link_categories_admin_delete" ON public.link_categories;
CREATE POLICY "link_categories_admin_delete" ON public.link_categories
  FOR DELETE USING (public.is_admin());

-- Migra categorias já usadas na tabela links
INSERT INTO public.link_categories (name, position)
SELECT DISTINCT category, ROW_NUMBER() OVER (ORDER BY category) - 1
FROM public.links
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (name) DO NOTHING;

-- Categorias padrão
INSERT INTO public.link_categories (name, position) VALUES
  ('3D Warehouse',  0),
  ('Revestimentos', 1),
  ('Mobiliário',    2),
  ('Paisagismo',    3),
  ('Fornecedores',  4),
  ('Referências',   5),
  ('Geral',         6)
ON CONFLICT (name) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════
-- 5. PAYMENTS (controle de pagamentos)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rows_data    JSONB NOT NULL DEFAULT '[]',
  header_data  JSONB NOT NULL DEFAULT '{}',
  values_data  JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT payments_user_id_unique UNIQUE (user_id)
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_own" ON payments;
CREATE POLICY "payments_own" ON payments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins veem E editam os pagamentos de todos os projetistas
DROP POLICY IF EXISTS "payments_admin_select" ON payments;
DROP POLICY IF EXISTS "payments_admin_all" ON payments;
CREATE POLICY "payments_admin_all" ON payments
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ══════════════════════════════════════════════════════════════════
-- 6. CHAT (mural de avisos + DMs)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_channels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL CHECK (type IN ('public', 'dm')),
  name       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);

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

CREATE INDEX IF NOT EXISTS idx_chat_msgs_channel_ts
  ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user
  ON chat_members(user_id);

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Função security definer — evita recursão na verificação de membro
CREATE OR REPLACE FUNCTION public.is_chat_member(channel_uuid UUID)
RETURNS BOOLEAN SECURITY DEFINER STABLE LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE channel_id = channel_uuid AND user_id = auth.uid()
  );
$$;

-- chat_channels: criador vê o canal recém-criado antes de virar membro
DROP POLICY IF EXISTS "ch_select" ON chat_channels;
CREATE POLICY "ch_select" ON chat_channels
  FOR SELECT TO authenticated
  USING (
    type = 'public'
    OR created_by = auth.uid()
    OR is_chat_member(id)
  );

DROP POLICY IF EXISTS "ch_insert" ON chat_channels;
CREATE POLICY "ch_insert" ON chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- chat_members
DROP POLICY IF EXISTS "cm_select" ON chat_members;
CREATE POLICY "cm_select" ON chat_members
  FOR SELECT TO authenticated
  USING (is_chat_member(channel_id));

DROP POLICY IF EXISTS "cm_insert" ON chat_members;
CREATE POLICY "cm_insert" ON chat_members
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- chat_messages
DROP POLICY IF EXISTS "msg_select" ON chat_messages;
CREATE POLICY "msg_select" ON chat_messages
  FOR SELECT TO authenticated
  USING (
    (
      EXISTS (SELECT 1 FROM chat_channels WHERE id = channel_id AND type = 'public')
      OR is_chat_member(channel_id)
    )
    AND (status = 'sent' OR is_admin())
  );

DROP POLICY IF EXISTS "msg_insert" ON chat_messages;
CREATE POLICY "msg_insert" ON chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "msg_update" ON chat_messages;
CREATE POLICY "msg_update" ON chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR is_admin())
  WITH CHECK (sender_id = auth.uid() OR is_admin());

-- Hard delete: somente admin
DROP POLICY IF EXISTS "msg_delete" ON chat_messages;
CREATE POLICY "msg_delete" ON chat_messages
  FOR DELETE TO authenticated
  USING (is_admin());

-- Realtime
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

-- Seed: canal #geral (idempotente)
INSERT INTO chat_channels (type, name)
SELECT 'public', '#geral'
WHERE NOT EXISTS (
  SELECT 1 FROM chat_channels WHERE type = 'public' AND name = '#geral'
);


-- ══════════════════════════════════════════════════════════════════
-- 6.5. SUGGESTIONS (sugestões de melhorias)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.suggestions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name   TEXT,
  user_email  TEXT,
  content     TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suggestions_insert_own" ON public.suggestions;
CREATE POLICY "suggestions_insert_own" ON public.suggestions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "suggestions_select_own" ON public.suggestions;
CREATE POLICY "suggestions_select_own" ON public.suggestions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "suggestions_admin_all" ON public.suggestions;
CREATE POLICY "suggestions_admin_all" ON public.suggestions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ══════════════════════════════════════════════════════════════════
-- 7. STORAGE (bucket igui-files, privado)
-- ══════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('igui-files', 'igui-files', false)
ON CONFLICT (id) DO NOTHING;

-- Usuário só na própria pasta (nome do arquivo começa com seu uid/)
DROP POLICY IF EXISTS "storage_upload_own" ON storage.objects;
CREATE POLICY "storage_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'igui-files'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

DROP POLICY IF EXISTS "storage_read_own" ON storage.objects;
CREATE POLICY "storage_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'igui-files'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

DROP POLICY IF EXISTS "storage_delete_own" ON storage.objects;
CREATE POLICY "storage_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'igui-files'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- Admin lê e escreve em tudo
DROP POLICY IF EXISTS "storage_admin_read_all" ON storage.objects;
CREATE POLICY "storage_admin_read_all" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'igui-files'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "storage_admin_write_all" ON storage.objects;
CREATE POLICY "storage_admin_write_all" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'igui-files'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "storage_admin_update_all" ON storage.objects;
CREATE POLICY "storage_admin_update_all" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'igui-files'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "storage_admin_delete_all" ON storage.objects;
CREATE POLICY "storage_admin_delete_all" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'igui-files'
    AND public.is_admin()
  );


-- ══════════════════════════════════════════════════════════════════
-- 8. FUNÇÕES ADMINISTRATIVAS
-- ══════════════════════════════════════════════════════════════════

-- Reset de senha pelo admin (usa pgcrypto/bcrypt)
CREATE OR REPLACE FUNCTION public.reset_user_password_admin(u_id UUID, new_pass TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND active = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores ativos podem resetar senhas.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_pass, gen_salt('bf', 10))
  WHERE id = u_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ══════════════════════════════════════════════════════════════════
-- 9. AUTO-LIMPEZA (pg_cron) — mensagens do #geral com +60 dias
--    DMs nunca são apagados. Requer extensão pg_cron habilitada.
-- ══════════════════════════════════════════════════════════════════

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

-- Agenda (idempotente): remove o job se existir e recria
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'igui-limpar-msgs-geral') THEN
    PERFORM cron.unschedule('igui-limpar-msgs-geral');
  END IF;
  PERFORM cron.schedule(
    'igui-limpar-msgs-geral',
    '0 3 1 * *',  -- dia 1 de cada mês, 03h00 UTC
    $job$ SELECT public.limpar_msgs_antigas(); $job$
  );
END $$;

-- ── Consultas úteis ──────────────────────────────────────────────
-- Jobs ativos:        SELECT * FROM cron.job;
-- Cancelar limpeza:   SELECT cron.unschedule('igui-limpar-msgs-geral');
-- Promover admin:     UPDATE profiles SET role = 'admin' WHERE email = 'seu@email.com';
-- Conferir índices:   SELECT indexname FROM pg_indexes WHERE tablename IN ('projects','profiles','chat_messages');


-- ══════════════════════════════════════════════════════════════════
-- 10. GMAIL TOKENS — armazena OAuth tokens por usuário
--     Tokens são acessados SOMENTE pelas Edge Functions via service role.
--     O cliente (browser) nunca lê os tokens diretamente.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_gmail_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry  TIMESTAMPTZ NOT NULL,
  gmail_email   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_gmail_tokens_user_id_unique UNIQUE (user_id)
);

ALTER TABLE public.user_gmail_tokens ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver apenas o próprio registro (e-mail conectado)
CREATE POLICY "gmail_tokens_own_select" ON public.user_gmail_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Escrita feita somente pelas Edge Functions via service role (bypassa RLS)
CREATE INDEX IF NOT EXISTS idx_gmail_tokens_user_id
  ON public.user_gmail_tokens(user_id);
