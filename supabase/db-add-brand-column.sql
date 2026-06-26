-- Adiciona coluna brand na tabela projects
-- Pranchas existentes ficam como 'iGUI' (todas foram iGUI até agora)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'iGUI'
  CHECK (brand IN ('iGUI', 'Splash'));
