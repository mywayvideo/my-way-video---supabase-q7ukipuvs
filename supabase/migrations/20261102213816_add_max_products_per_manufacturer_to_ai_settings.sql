-- ==============================================================================
-- Migração: Adiciona max_products_per_manufacturer em ai_settings
--
-- ATENÇÃO: Conforme diretriz do projeto My Way Video, esta migração deve ser
-- executada MANUALMENTE no painel do Supabase (SQL Editor).
-- Ao final, o comando NOTIFY pgrst, 'reload schema' atualiza o cache do PostgREST
-- para evitar erros PGRST205.
-- ==============================================================================

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS max_products_per_manufacturer integer NOT NULL DEFAULT 2;

-- Garantir check constraint para aceitar apenas valores de 1 a 8
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_settings_max_products_per_manufacturer_check'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_max_products_per_manufacturer_check
      CHECK (max_products_per_manufacturer >= 1 AND max_products_per_manufacturer <= 8);
  END IF;
END $$;

-- Atualizar registros existentes que possam estar nulos ou com default
UPDATE public.ai_settings
SET max_products_per_manufacturer = 2
WHERE max_products_per_manufacturer IS NULL;

-- Notificar PostgREST para recarregar o schema imediatamente
NOTIFY pgrst, 'reload schema';
