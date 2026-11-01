-- Migração para enriquecer palavras-chave da família de Gravadores na tabela ncm_support
-- e adicionar termos de Cloud Dock/Store/Storage conforme documentado
UPDATE public.ncm_support
SET palavras_chave = ARRAY[
  'gravador',
  'video recorder',
  'hyperdeck',
  'deck',
  'video server',
  'ssd recorder',
  'ki pro',
  'shogun',
  'cloud dock',
  'cloud store',
  'cloud storage',
  'dock',
  'servidor de video',
  'video assist'
]
WHERE id = '570bcca0-0b96-4458-a1b0-5c2b2e88035b'
   OR familia ILIKE '%Gravadores de vídeo digitais%';
