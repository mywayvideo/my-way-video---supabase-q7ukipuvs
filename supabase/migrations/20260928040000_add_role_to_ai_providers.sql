-- Migration: Add purpose/role to ai_providers for dedicated auditor configuration
ALTER TABLE public.ai_providers 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'general';

-- Update existing providers to have appropriate roles
UPDATE public.ai_providers
SET role = 'auditor'
WHERE provider_name = 'deepseek' OR model_id ILIKE '%deepseek%';

UPDATE public.ai_providers
SET role = 'analyst'
WHERE provider_name = 'openai' OR model_id ILIKE '%gpt-4o-mini%';
