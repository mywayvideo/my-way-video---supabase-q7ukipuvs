-- ==============================================================================
-- Migration: 20261107230000_purge_empty_adhoc_categories.sql
--
-- Remove as categorias nao-canonicas VAZIAS criadas em lote em 07/11/2026 21:38 UTC.
-- Autorizado pelo proprietario (Patrick Lynch) em 07/11/2026.
--
-- GARANTIAS DE SEGURANCA (a migration se recusa a rodar se qualquer uma falhar):
--   1. Nenhuma categoria canonica e tocada.
--   2. So exclui categoria com ZERO produtos vinculados (checado no momento da execucao).
--   3. So exclui categoria cujo nome NAO esteja na lista canonica.
--   4. Foi preservada 'Card Readers' (canonica, porem vazia).
--
-- Backup previo: work/mwv/backup_categories_antes.json (162 linhas)
-- Lista de nomes: work/mwv/excluir.json (85 nomes)
-- ==============================================================================

DO $$
DECLARE
  v_alvo   text[] := ARRAY[
    ('c7a87b7f-4338-45c8-8856-5cf374154dea'),
    ('874b1ac4-1a96-4e40-8fe9-2c33051eba9d'),
    ('de47b7cb-9269-47ac-bbd3-957faf8e6621'),
    ('3f331cbd-0944-4ff1-ad31-3ef5d5691b94'),
    ('1a23e2ab-17e4-441d-8816-6181478c2bb4'),
    ('e812ec58-0302-4a81-9979-1019b254aca3'),
    ('94d3e7d0-aa99-4086-bf02-dd06bc5ac13d'),
    ('ae92dfe4-15ad-4446-be9d-d0511266b57b'),
    ('2c0f18ff-0710-45e4-b2ec-f56a7d9458cc'),
    ('e3d71988-75db-4685-9db7-a08c585eb456'),
    ('50c27640-7f7e-4392-8117-23ac6d676825'),
    ('50c586c3-c44d-469b-ab70-522a31128baf'),
    ('3868cfcb-5051-4c7a-b5b0-e56f4cc995d4'),
    ('003d8f0a-0a11-46be-a217-957489db6194'),
    ('8856b406-8779-4862-afd9-7a5ba2f6110a'),
    ('5578d9d9-535b-4f3f-8f05-96c17ad95bfe'),
    ('47405fe1-bec3-4c86-bd8a-a0ff00dd225b'),
    ('f6ab8918-d9fe-4f53-8e04-bf91c9071656'),
    ('be51a476-e21e-4eb1-9c93-e80a5b124977'),
    ('c7a319f3-94a4-4860-ab7a-3f85dc0f71bb'),
    ('66257ba0-b6cc-4cca-9d5c-47df90e07b0d'),
    ('b59fac7e-11aa-4e33-92e9-ddcbed94ded1'),
    ('f72d9d32-cc39-40eb-b8b6-72c8a88d1ffd'),
    ('5b5d7b59-3092-438f-9f3a-b6b75e4df3a7'),
    ('aa2fc1ff-9356-45ab-b2de-a67b2961e92f'),
    ('7bc34e37-0cd9-435c-88a0-01afbae380dc'),
    ('18e6c3c4-7a44-4888-ac73-15b9273e89a8'),
    ('860118d4-f470-48f7-8808-8a710a6ae4d0'),
    ('e687f5f8-d6d3-4bc4-8aba-cfb8951a251a'),
    ('750a7bc9-d542-4301-9e5d-a65a0b2f5632'),
    ('db30cad5-a2dc-420b-9c4c-aa75b6630f27'),
    ('6d4cbb04-8e5c-4de8-8150-18087b864139'),
    ('12891264-36ab-41ee-b7b8-1e343355918d'),
    ('07dda62f-254a-4b78-a8d7-2b72df9b0c5b'),
    ('40f2aa5c-e1c6-41df-9ac5-55937456973a'),
    ('1aff821a-3058-4da3-8bd3-a0ae84c78b38'),
    ('b42d41bd-053c-4cf6-a0e8-274b1e6da34a'),
    ('863df41d-c8df-4125-ac3c-c9a273f9b950'),
    ('0c7a9aff-c05f-4f4c-bcd6-8e47ec32b55f'),
    ('1421a6cc-3bc9-4581-b1bb-90d258dccbd0'),
    ('444fcc7a-a676-492d-875a-64a5689e848c'),
    ('c8e654c2-0526-4a54-97fe-9b119910dfcc'),
    ('b495f164-8492-4e5a-8ab5-08b08b7ce938'),
    ('feebdb7e-9efa-4234-86e4-031dd4b7bfc6'),
    ('8694346f-8817-4bc4-832a-d614a82c89b1'),
    ('e85912cc-c920-49a4-97fe-3cbf2e5d8741'),
    ('31ee650b-5ae5-4886-9705-e9f1d80ab598'),
    ('d2fdd92a-431d-45e0-9147-6ee7b0eda29d'),
    ('2d619800-42e0-4a38-936f-94748f378b39'),
    ('72c3e37a-f01a-4338-811f-a791769c7a03'),
    ('9d65d953-b3c4-4984-980e-5cee032066e2'),
    ('ab5a4c16-a596-4559-957a-9c810dd41816'),
    ('65f9d821-03fe-48df-9dd5-4d4d1f73ae05'),
    ('f82e896e-429e-40dc-83db-2c9b62662616'),
    ('192e14e1-d182-4226-9dbe-3e58d287012b'),
    ('4ebe348f-26ae-4f0c-91d0-e6e120ceaf08'),
    ('5d0f5bf5-984c-4dab-89dc-c0ae0b9676fb'),
    ('5063f5ae-857e-4b65-8548-08e5b290076f'),
    ('d2e5e373-7dd9-4c4b-93f9-4654d95dcd78'),
    ('30e2073e-f05b-4d15-8477-ae059ec1d313'),
    ('1331952f-f905-420d-9006-1bc66dd2fa98'),
    ('05314d00-6ef3-4e74-8cc4-41fd49555496'),
    ('258191bc-bc2f-46d8-af11-ef71f35fe37a'),
    ('1dd076ca-e63b-49d7-8081-f0b027f325c3'),
    ('a06f5a7e-4f5c-4b69-b09e-8fad487f1a33'),
    ('f1d75126-5711-442a-92af-e54418fa53c5'),
    ('3e313ef7-c359-48f2-bc76-71d4fd9576cb'),
    ('d35a6bcb-019a-4087-a414-a63609f67201'),
    ('61428870-037a-42d8-abe1-6f085921e4fe'),
    ('56aaecd0-e479-4d00-acda-43ac5ffc19d3'),
    ('5628b959-ced2-46b6-99c6-b344d8bffd52'),
    ('60d0493a-218e-4172-907b-9fb80735104f'),
    ('579ca81e-568f-4f8f-9d98-6c2130989d2a'),
    ('8658aa92-8af7-4296-990d-23e47f66339e'),
    ('cb70e5fe-0975-45b5-8496-70b412c34e74'),
    ('3dc65e0c-2ef9-4649-8dbd-e8538fe388ec'),
    ('aa7856a7-461e-4576-b6e5-a4398fd462b9'),
    ('25d88c1c-7f39-4780-89c6-99959c8fe9cf'),
    ('edd0442d-cee9-4c40-b2c0-5cd60df86d0a'),
    ('bdea8a77-5799-4223-be0d-bac53d144f0a'),
    ('e3aa0015-b1b0-4685-86e8-592adfe0ac73'),
    ('8189b32e-e8fc-495a-9f16-19cfd70fe3a0'),
    ('c31ff86a-39ba-4034-ae9d-32142b0bb780'),
    ('7a1be32a-b9e8-487b-9137-ededfc56c44d'),
    ('3fee9229-7beb-489a-bce2-9e5003702067')
  ]::text[];
  v_nomes  text[] := ARRAY[
  'Accessories',
  'Audio',
  'Batteries & Chargers',
  'Cables & Connectors',
  'Cameras',
  'Card Readers',
  'Control Panels',
  'Converters',
  'Desktop Video',
  'Lenses',
  'Memory Cards & Media',
  'Monitors',
  'Networking & Storage',
  'Production Switchers',
  'Recorders',
  'Software',
  'Streaming',
  'Teleprompters',
  'Tripods & Rigs'
  ];
  v_n         int;
  v_ocupadas  text;
  v_canonicas text;
BEGIN
  -- trava 1: alguma delas tem produto?
  SELECT string_agg(c.name || ' (' || cnt || ')', ', ')
    INTO v_ocupadas
  FROM (
    SELECT c.name, count(p.id) AS cnt
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
     WHERE c.id = ANY(v_alvo::uuid[])
     GROUP BY c.name
    HAVING count(p.id) > 0
  ) s;

  IF v_ocupadas IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: categorias com produtos: %', v_ocupadas;
  END IF;

  -- trava 2: alguma delas e canonica pelo nome?
  SELECT string_agg(c.name, ', ')
    INTO v_canonicas
  FROM categories c
  WHERE c.id = ANY(v_alvo::uuid[])
    AND c.name = ANY(v_nomes);

  IF v_canonicas IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: tentativa de excluir categoria canonica: %', v_canonicas;
  END IF;

  -- exclusao
  DELETE FROM categories WHERE id = ANY(v_alvo::uuid[]);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RAISE NOTICE 'Excluidas % categorias vazias nao-canonicas.', v_n;

  -- conferencia
  SELECT count(*) INTO v_n FROM categories;
  RAISE NOTICE 'Total de categorias restantes: %', v_n;
END $$;
