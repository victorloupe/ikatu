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
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    rows_data::text,
    -- Tipos de projeto
    'AtÃ© 02 Projetos',                   'Até 02 Projetos'),
    'Projeto 360Âº',                       'Projeto 360º'),
    'Projeto 360Âº (3 ModificaÃ§Ãµes)',   'Projeto 360º (3 Modificações)'),
    'AlteraÃ§Ãµes GRANDES',               'Alterações GRANDES'),
    'ModificaÃ§Ãµes',                      'Modificações'),
    -- Caracteres soltos remanescentes (fallback)
    'Ã©', 'é'),
    'Ã£', 'ã'),
    'Ã§', 'ç'),
    'Ãµ', 'õ'),
    'Ã ', 'à'),
    'Ã¡', 'á'),
    'Ã­', 'í'),
    'Ã³', 'ó'),
    'Ãº', 'ú'),
    'Â°', '°'),
    'Âº', 'º'),
    'Â³', '³')
)::jsonb
WHERE rows_data::text ILIKE '%Ã%'
   OR rows_data::text ILIKE '%Â%';

-- ── 3. Normalizar campo header_data (JSONB) se houver ────────────
UPDATE payments
SET header_data = (
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    header_data::text,
    'Ã©', 'é'),
    'Ã£', 'ã'),
    'Ã§', 'ç'),
    'Ãµ', 'õ'),
    'Â°', '°'),
    'Âº', 'º')
)::jsonb
WHERE header_data IS NOT NULL
  AND (header_data::text ILIKE '%Ã%' OR header_data::text ILIKE '%Â%');

-- ── 4. Verificar depois ───────────────────────────────────────────
-- SELECT id, rows_data FROM payments
-- WHERE rows_data::text ILIKE '%Ã%'
--    OR rows_data::text ILIKE '%Â%';
-- Deve retornar 0 linhas.
