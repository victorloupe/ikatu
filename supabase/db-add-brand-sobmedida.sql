-- ══════════════════════════════════════════════════════════════════
-- Ikatu — Adiciona a marca "iGUi SOB MEDIDA"
-- Execute este script no Supabase SQL Editor.
-- Libera a nova marca nas travas (CHECK constraints) que hoje só
-- aceitam 'iGUI'/'iGUi' e 'Splash'.
-- ══════════════════════════════════════════════════════════════════

-- 1. Coluna brand da tabela de projetos (pranchas)
--    Constraint original criada em db-add-brand-column.sql
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_brand_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_brand_check
  CHECK (brand IN ('iGUI', 'Splash', 'iGUi SOB MEDIDA'));

-- 2. Coluna franquia da tabela de lojas (cadastro de Lojas/Franquia)
--    Constraint original criada em db-relacao-projetos.sql
ALTER TABLE public.metadata_lojas
  DROP CONSTRAINT IF EXISTS metadata_lojas_franquia_check;

ALTER TABLE public.metadata_lojas
  ADD CONSTRAINT metadata_lojas_franquia_check
  CHECK (franquia IN ('iGUi', 'Conceito', 'Internacional', 'Splash', 'iGUi SOB MEDIDA'));

-- Observação: a tabela metadata_piscinas (catálogo de modelos, coluna "marca")
-- NÃO foi alterada — iGUi SOB MEDIDA é um projeto sob medida, sem catálogo
-- fixo de modelos, então continua usando o catálogo padrão da iGUi.
-- Se no futuro for necessário um catálogo próprio, rode:
--   ALTER TABLE public.metadata_piscinas DROP CONSTRAINT IF EXISTS metadata_piscinas_marca_check;
--   ALTER TABLE public.metadata_piscinas ADD CONSTRAINT metadata_piscinas_marca_check
--     CHECK (marca IN ('iGUi', 'Splash', 'iGUi SOB MEDIDA'));

-- Observação: se o nome real da constraint no seu banco for diferente do
-- assumido acima (padrão Postgres <tabela>_<coluna>_check), rode antes:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.projects'::regclass;
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.metadata_lojas'::regclass;
-- e ajuste o DROP CONSTRAINT com o nome encontrado.
