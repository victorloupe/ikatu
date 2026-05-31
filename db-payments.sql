-- ══════════════════════════════════════════════════════
-- SCHEMA e Políticas para a Tabela PAYMENTS (Pagamentos)
-- Rodar no Supabase SQL Editor
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rows_data    JSONB NOT NULL DEFAULT '[]',
  header_data  JSONB NOT NULL DEFAULT '{}',
  values_data  JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Política RLS: Usuário pode gerenciar (SELECT, INSERT, UPDATE, DELETE) seus próprios pagamentos
DROP POLICY IF EXISTS "payments_own" ON payments;
CREATE POLICY "payments_own" ON payments
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política RLS: Administrador pode visualizar todos os pagamentos
DROP POLICY IF EXISTS "payments_admin_select" ON payments;
CREATE POLICY "payments_admin_select" ON payments
  FOR SELECT 
  USING (public.is_admin());

-- Trigger para updated_at automático
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
