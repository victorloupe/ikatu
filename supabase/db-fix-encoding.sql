-- ══════════════════════════════════════════════════════════════
-- db-fix-encoding.sql
-- Corrige strings com double-encoding UTF-8 na tabela payments.
-- Origem: dados salvos quando o cliente HTTP interpretava a string
-- como Latin-1 antes de re-encodar em UTF-8 (ex: 'Até' virou 'AtÃ©').
--
-- COMO RODAR:
--   Supabase Dashboard → SQL Editor → cole e execute.
--   Ou via CLI:  supabase db push  (se integrado ao projeto).
--
-- SEGURO para re-executar (idempotente): o UPDATE só toca linhas que
-- ainda contêm as strings corrompidas.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Verificar antes ────────────────────────────────────────────
-- (opcional) Conte quantas linhas serão afetadas:
-- SELECT COUNT(*) FROM payments
-- WHERE rows_data::text ILIKE '%AtÃ%'
--    OR rows_data::text ILIKE '%Âº%'
--    OR rows_data::text ILIKE '%Ã§%';

-- ── 2. Normalizar campo rows_data (JSONB) ─────────────────────────
UPDATE payments
SET rows_data = (
  rows_data::text
    -- Tipos de projeto
    REPLACE('AtÃ© 02 Projetos',                   'Até 02 Projetos')
    REPLACE('Projeto 360Âº',                       'Projeto 360º')
    REPLACE('Projeto 360Âº (3 ModificaÃ§Ãµes)',   'Projeto 360º (3 Modificações)')
    REPLACE('AlteraÃ§Ãµes GRANDES',               'Alterações GRANDES')
    REPLACE('ModificaÃ§Ãµes',                      'Modificações')
    -- Caracteres soltos remanescentes (fallback)
    REPLACE('Ã©', 'é')
    REPLACE('Ã£', 'ã')
    REPLACE('Ã§', 'ç')
    REPLACE('Ãµ', 'õ')
    REPLACE('Ã ', 'à')
    REPLACE('Ã¡', 'á')
    REPLACE('Ã­', 'í')
    REPLACE('Ã³', 'ó')
    REPLACE('Ãº', 'ú')
    REPLACE('Â°', '°')
    REPLACE('Âº', 'º')
    REPLACE('Â³', '³')
)::jsonb
WHERE rows_data::text ILIKE '%Ã%'
   OR rows_data::text ILIKE '%Â%';

-- ── 3. Normalizar campo header_data (JSONB) se houver ────────────
UPDATE payments
SET header_data = (
  header_data::text
    REPLACE('Ã©', 'é')
    REPLACE('Ã£', 'ã')
    REPLACE('Ã§', 'ç')
    REPLACE('Ãµ', 'õ')
    REPLACE('Â°', '°')
    REPLACE('Âº', 'º')
)::jsonb
WHERE header_data IS NOT NULL
  AND (header_data::text ILIKE '%Ã%' OR header_data::text ILIKE '%Â%');

-- ── 4. Verificar depois ───────────────────────────────────────────
-- SELECT id, rows_data FROM payments
-- WHERE rows_data::text ILIKE '%Ã%'
--    OR rows_data::text ILIKE '%Â%';
-- Deve retornar 0 linhas.
