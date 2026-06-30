-- Tabela unica de precos usada por:
-- - Admin > Precos
-- - Pagamentos > Relacao de Projetos para Pagamento
-- - Relacao de Projetos > Resumo financeiro

CREATE TABLE IF NOT EXISTS public.global_prices (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000',
  val_ate2 NUMERIC NOT NULL DEFAULT 70,
  val_3a4 NUMERIC NOT NULL DEFAULT 80,
  val_mais5 NUMERIC NOT NULL DEFAULT 95,
  val_360 NUMERIC NOT NULL DEFAULT 90,
  val_360_3mod NUMERIC NOT NULL DEFAULT 105,
  val_conceito NUMERIC NOT NULL DEFAULT 150,
  val_alt_grandes NUMERIC NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT global_prices_singleton
    CHECK (id = '00000000-0000-0000-0000-000000000000')
);

ALTER TABLE public.global_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_prices_read_auth" ON public.global_prices;
CREATE POLICY "global_prices_read_auth" ON public.global_prices
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "global_prices_admin_insert" ON public.global_prices;
CREATE POLICY "global_prices_admin_insert" ON public.global_prices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "global_prices_admin_update" ON public.global_prices;
CREATE POLICY "global_prices_admin_update" ON public.global_prices
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.global_prices (
  id, val_ate2, val_3a4, val_mais5, val_360, val_360_3mod, val_conceito, val_alt_grandes
)
VALUES (
  '00000000-0000-0000-0000-000000000000', 70, 80, 95, 90, 105, 150, 60
)
ON CONFLICT (id) DO NOTHING;
