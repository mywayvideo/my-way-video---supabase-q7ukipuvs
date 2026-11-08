-- ==============================================================================
-- Migration: 20261107233000_create_lighting_category.sql
--
-- Cria a categoria canonica 'Lighting' e vincula os 5 produtos de iluminacao
-- que estavam em 'Camera Accessories'.
--
-- AUTORIZADA EXPLICITAMENTE pelo proprietario (Patrick Lynch) em 07/11/2026,
-- na mensagem: "Aplique a categoria nos 247 de alta confianca e crie a
-- categoria Lighthing, se puder."
--
-- Por que migration e nao API: o perfil 'reviewer' nao tem permissao de INSERT
-- em public.categories — o RLS devolve 403, por desenho. A criacao de categoria
-- e ato administrativo e precisa passar por migration revisavel.
--
-- ESCOPO ESTRITO: cria 1 categoria e altera SOMENTE
-- category_id / category / updated_at / last_reviewed_at dos 5 produtos.
--
-- Os 247 produtos de alta confianca foram aplicados separadamente pela API,
-- com a credencial da revisora, para gerar trilha em category_audit_log.
-- ==============================================================================

DO $$
DECLARE
  v_lighting_id uuid;
  v_n           int;
BEGIN
  -- 1. Criar a categoria (idempotente)
  SELECT id INTO v_lighting_id
    FROM public.categories
   WHERE lower(trim(name)) = 'lighting'
   LIMIT 1;

  IF v_lighting_id IS NULL THEN
    v_lighting_id := gen_random_uuid();
    INSERT INTO public.categories (id, name, description, acceptable_ncms, is_active, created_at)
    VALUES (
      v_lighting_id,
      'Lighting',
      'Iluminacao profissional: softboxes, fresneis, tubos LED, paineis e suportes de luz',
      ARRAY['9405.42.00', '9405.40', '9405.41', '9405.49', '9006.69'],
      true,
      NOW()
    );
    RAISE NOTICE 'Categoria Lighting criada: %', v_lighting_id;
  ELSE
    RAISE NOTICE 'Categoria Lighting ja existia: %', v_lighting_id;
  END IF;

  -- 2. Vincular os 5 produtos de iluminacao
  UPDATE public.products
     SET category_id      = v_lighting_id,
         category         = 'Lighting',
         updated_at       = NOW(),
         last_reviewed_at = NOW()
   WHERE id = ANY(ARRAY[
     '8cd47d41-d759-4159-8e7a-c2468655479c',  -- E-Image LS HS-T120 LED Tube
     '97e68b28-1d58-4858-8051-df59f23aa3e9',  -- E-Image EJ-350 Studio Lighting
     '97e8f4c6-6cb2-45a6-9ff2-81ddd8320cd9',  -- E-Image CSL65 Lantern Softbox
     'a1f30eb1-250b-4aa3-8e4c-479b7893668d',  -- E-Image EJ-160
     'bbf4575b-c3b4-424d-92ff-96bb0eea5a97'   -- E-Image EJ-250M Studio Lighting
   ]::uuid[]);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Produtos vinculados a Lighting: %', v_n;

  -- 3. Conferencia
  SELECT count(*) INTO v_n FROM public.categories;
  RAISE NOTICE 'Total de categorias: %', v_n;
  SELECT count(*) INTO v_n FROM public.products WHERE category_id IS NULL;
  RAISE NOTICE 'Produtos sem categoria: %', v_n;
END $$;

NOTIFY pgrst, 'reload schema';
