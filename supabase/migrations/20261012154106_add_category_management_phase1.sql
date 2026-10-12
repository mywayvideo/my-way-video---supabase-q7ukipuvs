-- Migration: add acceptable_ncms and is_active to categories, insert Audio and Networking & Storage, and backfill acceptable_ncms
ALTER TABLE public.categories 
  ADD COLUMN IF NOT EXISTS acceptable_ncms _text DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Ensure Audio category exists
INSERT INTO public.categories (name, description, is_active, acceptable_ncms)
VALUES ('Audio', 'Equipamentos e acessórios de áudio profissional, microfones, mesas e interfaces', true, '{"8518", "8519", "8527", "8517.62"}'::text[])
ON CONFLICT DO NOTHING;

-- Ensure Networking & Storage category exists
INSERT INTO public.categories (name, description, is_active, acceptable_ncms)
VALUES ('Networking & Storage', 'Equipamentos de rede, switches, roteadores e sistemas de armazenamento / storage', true, '{"8471.70", "8471.80", "8517.62"}'::text[])
ON CONFLICT DO NOTHING;

-- Update acceptable_ncms for existing categories based on domain rules
UPDATE public.categories 
SET acceptable_ncms = '{"9002", "9002.11", "9002.19"}'::text[]
WHERE name = 'Lenses' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8528.52", "8528.59", "8528.72"}'::text[]
WHERE name = 'Monitors' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8543.70.35", "8543.70.99", "8471.60", "8471.80"}'::text[]
WHERE name = 'Streaming' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8543.70.99", "8471.60.90", "9002.20.90", "8517.62"}'::text[]
WHERE name = 'Converters' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8507.60", "8507.80", "8504.40"}'::text[]
WHERE name = 'Batteries' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8525.80", "8525.89", "9007.10"}'::text[]
WHERE name = 'Cameras' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8471.60", "8471.80", "8543.70"}'::text[]
WHERE name = 'Desktop Video' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8523.51", "8523.52", "8523.59", "8523.80"}'::text[]
WHERE name = 'Media' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8521.90", "8521.10"}'::text[]
WHERE name = 'Recorders' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8523.49"}'::text[]
WHERE name = 'Software' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8529.90", "9007.91"}'::text[]
WHERE name = 'Teleprompters' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"9620.00"}'::text[]
WHERE name = 'Tripods & Rigs' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);

UPDATE public.categories 
SET acceptable_ncms = '{"8517", "8518", "8529", "8544", "8504", "4202", "7326", "7616", "8479"}'::text[]
WHERE name = 'Accessories' AND (acceptable_ncms IS NULL OR acceptable_ncms = '{}'::text[]);
