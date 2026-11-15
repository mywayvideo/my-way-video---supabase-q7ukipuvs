-- Fase 1 da reestruturação de categorias: "Acessórios" vira atributo do produto.
-- Migração a ser aplicada MANUALMENTE no SQL Editor do Supabase (não é aplicada automaticamente).

-- 1) Atributo de acessório no produto (categoria principal continua obrigatória)
alter table public.products
  add column if not exists is_accessory boolean not null default false;

-- 2) Mecanismo de desativação de categoria (Accessories é desativada, NÃO apagada)
alter table public.categories
  add column if not exists is_active boolean not null default true;

-- 3) Produtos hoje na categoria Accessories passam a ser marcados como acessórios.
--    O category_id permanece Accessories até a aprovação da reclassificação no admin.
update public.products
   set is_accessory = true
 where is_accessory = false
   and category_id in (select c.id from public.categories c where c.name = 'Accessories');

-- 4) Contagem separada por categoria: produtos (sem acessórios) e acessórios.
create or replace function public.get_category_product_split()
returns table (category_id text, products bigint, accessories bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id::text,
         count(p.id) filter (where p.is_accessory = false),
         count(p.id) filter (where p.is_accessory = true)
    from public.categories c
    left join public.products p on p.category_id = c.id
   group by c.id;
$$;

grant execute on function public.get_category_product_split() to anon, authenticated, service_role;

create index if not exists products_category_id_is_accessory_idx
  on public.products (category_id, is_accessory);

-- Recarrega o cache do PostgREST (evita PGRST205 logo após aplicar)
NOTIFY pgrst, 'reload schema';
