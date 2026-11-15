import { supabase } from '@/lib/supabase/client'

// Fase 2 do plano de acessórios: vínculos de COMPATIBILIDADE (acessório ↔ produto com que funciona).
// Diferente de "relacionado" (related_product_rules / ai_related_ids): não misturar as duas semânticas.
// Nesta etapa só existe CRUD manual; nenhuma análise ou sugestão automática roda aqui.

export const COMPATIBILITY_TABLE = 'product_compatibilities'

// Códigos que indicam que a tabela ainda não existe no remoto (migração não aplicada).
const MISSING_TABLE_CODES = ['42P01', 'PGRST205']

export interface CompatibilityLink {
  id: string
  productId: string
  name: string
  sku: string | null
  category: string | null
  priceBrl: number | null
  origem: 'manual' | 'ai'
  status: 'sugerido' | 'aprovado' | 'rejeitado'
}

export interface CompatibilityLinksResult {
  links: CompatibilityLink[]
  /** true quando a tabela ainda não existe no banco: a tela mostra aviso, sem quebrar. */
  unavailable: boolean
}

export interface CatalogSearchItem {
  id: string
  name: string
  sku: string | null
  category: string | null
  price_brl: number | null
  is_accessory: boolean
}

const SEARCH_LIMIT = 20

/** Escapa curingas do ILIKE e vírgulas usadas pelo filtro .or() do PostgREST. */
function sanitizeTerm(term: string): string {
  return term
    .trim()
    .replace(/[%_,()]/g, ' ')
    .trim()
}

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error && MISSING_TABLE_CODES.includes(error.code ?? '')
}

export const compatibilityService = {
  /** Busca acessórios (is_accessory = true) por nome ou SKU. */
  async searchAccessories(term: string): Promise<CatalogSearchItem[]> {
    return this.searchProducts(term, { accessoriesOnly: true })
  },

  /** Busca produtos candidatos a compatíveis por nome ou SKU (exclui o próprio acessório). */
  async searchCompatibleCandidates(
    term: string,
    excludeProductId: string,
  ): Promise<CatalogSearchItem[]> {
    return this.searchProducts(term, { accessoriesOnly: false, excludeId: excludeProductId })
  },

  async searchProducts(
    term: string,
    opts: { accessoriesOnly: boolean; excludeId?: string },
  ): Promise<CatalogSearchItem[]> {
    const clean = sanitizeTerm(term)
    if (clean.length < 2) return []

    let query = supabase
      .from('products')
      .select('id, name, sku, category, price_brl, is_accessory')
      .or(`name.ilike.%${clean}%,sku.ilike.%${clean}%`)
      .order('name')
      .limit(SEARCH_LIMIT)

    if (opts.accessoriesOnly) query = query.eq('is_accessory', true)
    if (opts.excludeId) query = query.neq('id', opts.excludeId)

    const { data, error } = await query
    if (error) throw error
    return (data || []) as CatalogSearchItem[]
  },

  /** Vínculos gravados de um acessório, com os dados do produto compatível. */
  async fetchLinks(accessoryId: string): Promise<CompatibilityLinksResult> {
    const { data, error } = await (supabase as any)
      .from(COMPATIBILITY_TABLE)
      .select(
        'id, product_id, origem, status, product:products!product_id(id, name, sku, category, price_brl)',
      )
      .eq('accessory_id', accessoryId)
      .order('created_at', { ascending: true })

    if (error) {
      if (isMissingTable(error)) return { links: [], unavailable: true }
      throw error
    }

    const links: CompatibilityLink[] = ((data || []) as any[]).map((row) => ({
      id: row.id,
      productId: row.product_id,
      name: row.product?.name ?? '(produto removido)',
      sku: row.product?.sku ?? null,
      category: row.product?.category ?? null,
      priceBrl: row.product?.price_brl == null ? null : Number(row.product.price_brl),
      origem: row.origem,
      status: row.status,
    }))
    return { links, unavailable: false }
  },

  /** Cria vínculo manual já aprovado (origem manual, status aprovado). */
  async addManualLink(accessoryId: string, productId: string): Promise<void> {
    const { error } = await (supabase as any).from(COMPATIBILITY_TABLE).upsert(
      {
        accessory_id: accessoryId,
        product_id: productId,
        origem: 'manual',
        status: 'aprovado',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'accessory_id,product_id' },
    )
    if (error) throw error
  },

  /** Remove um vínculo gravado. */
  async removeLink(linkId: string): Promise<void> {
    const { error } = await (supabase as any).from(COMPATIBILITY_TABLE).delete().eq('id', linkId)
    if (error) throw error
  },
}
