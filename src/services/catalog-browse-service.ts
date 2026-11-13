import { supabase } from '@/lib/supabase/client'

/**
 * Dados para a navegação por categoria (layout 3).
 *
 * Decisões do Patrick (12/11/2026):
 *  - grade de categorias na home
 *  - ordenação por preço em USD
 *  - filtro de fabricante mostra SÓ os fabricantes com produto na categoria
 *
 * REGRA DE COERÊNCIA: a contagem da vitrine tem de ser a mesma da listagem.
 * Por isso TODAS as contagens ignoram produto descontinuado, igual à listagem.
 * Sem isso o card dizia 243 e a página mostrava 240.
 */

/** Produto descontinuado não entra na navegação (nem na contagem). */
const escopoAtivo = (tabela: any) => tabela.eq('is_discontinued', false)

export interface CategoryWithCount {
  id: string
  name: string
  description: string | null
  productCount: number
}

export interface ManufacturerWithCount {
  id: string
  name: string
  productCount: number
}

export interface CatalogProduct {
  id: string
  name: string
  sku: string
  image_url: string | null
  price_usd: number | null
  price_brl: number | null
  price_nationalized_sales: number | null
  price_nationalized_cost: number | null
  price_nationalized_currency: string | null
  stock: number | null
  is_discontinued: boolean | null
  category: string | null
  category_id: string | null
  manufacturer_id: string | null
  weight: number | null
  manufacturer: { id: string; name: string } | null
}

/** Contagem por categoria, direto do banco (products.category_id). */
export async function getCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const [{ data: cats, error: catErr }, products] = await Promise.all([
    (supabase.from('categories').select('id, name, description, is_active') as any).order('name'),
    fetchAllProductRefs(),
  ])

  if (catErr) throw catErr

  const counts = new Map<string, number>()
  for (const p of products) {
    const key = p.category_id || '__sem__'
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return (
    (cats || [])
      .filter((c: any) => c.is_active !== false)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? null,
        productCount: counts.get(c.id) || 0,
      }))
      // categoria sem produto não entra na grade: não prometer o que não há
      .filter((c: CategoryWithCount) => c.productCount > 0)
      .sort((a: CategoryWithCount, b: CategoryWithCount) => b.productCount - a.productCount)
  )
}

/** Produtos com contagem por fabricante dentro de UMA categoria. */
export async function getManufacturersForCategory(
  categoryId: string,
): Promise<ManufacturerWithCount[]> {
  const { data, error } = await escopoAtivo(
    supabase
      .from('products')
      .select('manufacturer_id, manufacturer:manufacturers(id, name)') as any,
  ).eq('category_id', categoryId)

  if (error) throw error

  const acc = new Map<string, ManufacturerWithCount>()
  for (const row of (data || []) as any[]) {
    const m = row.manufacturer
    if (!m?.id) continue
    const cur = acc.get(m.id)
    if (cur) cur.productCount += 1
    else acc.set(m.id, { id: m.id, name: m.name, productCount: 1 })
  }
  return [...acc.values()].sort((a, b) => b.productCount - a.productCount)
}

/** Produtos de uma categoria, já filtrados e ordenados por preço USD. */
export async function getProductsByCategory(opts: {
  categoryId: string
  manufacturerIds?: string[]
  order?: 'asc' | 'desc'
  includeDiscontinued?: boolean
}): Promise<CatalogProduct[]> {
  const { categoryId, manufacturerIds, order = 'asc' } = opts

  let query = (supabase.from('products') as any).select(
    'id, name, sku, image_url, price_usd, price_brl, price_nationalized_sales, ' +
      'price_nationalized_cost, price_nationalized_currency, stock, is_discontinued, ' +
      'category, category_id, manufacturer_id, weight, manufacturer:manufacturers(id, name)',
  )

  if (!opts.includeDiscontinued) query = escopoAtivo(query)
  query = query.eq('category_id', categoryId)

  if (manufacturerIds && manufacturerIds.length > 0) {
    query = query.in('manufacturer_id', manufacturerIds)
  }

  // ordenação por preço em USD; nulos por último
  query = query.order('price_usd', { ascending: order === 'asc', nullsFirst: false })

  const { data, error } = await query.limit(1000)
  if (error) throw error
  return (data || []) as CatalogProduct[]
}

/** Só os campos mínimos, para contar categoria sem trazer o produto inteiro. */
async function fetchAllProductRefs(): Promise<
  { category_id: string | null; manufacturer_id: string | null }[]
> {
  const PAGE = 1000
  const out: { category_id: string | null; manufacturer_id: string | null }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await escopoAtivo(
      supabase.from('products').select('category_id, manufacturer_id') as any,
    ).range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

export const catalogBrowseService = {
  getCategoriesWithCounts,
  getManufacturersForCategory,
  getProductsByCategory,
}
