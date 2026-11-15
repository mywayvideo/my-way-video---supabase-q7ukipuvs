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

  /** Busca produtos PRINCIPAIS (is_accessory = false) candidatos a compatíveis por nome ou SKU. */
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
    else query = query.eq('is_accessory', false)
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
    if (accessoryId === productId) {
      throw new Error('Não é possível vincular um produto a ele mesmo.')
    }

    // Regra: vínculo é sempre acessório ↔ produto principal. Busca o flag dos dois lados.
    const { data, error: fetchError } = await supabase
      .from('products')
      .select('id, is_accessory')
      .in('id', [accessoryId, productId])

    if (fetchError) throw fetchError
    const rows = (data || []) as { id: string; is_accessory: boolean | null }[]
    const accessorySide = rows.find((r) => r.id === accessoryId)
    const productSide = rows.find((r) => r.id === productId)

    if (!accessorySide || !productSide) {
      throw new Error('Produto não encontrado no catálogo. Recarregue a busca e tente novamente.')
    }
    if (accessorySide.is_accessory && productSide.is_accessory) {
      throw new Error(
        'Vínculo recusado: os dois produtos estão marcados como acessório. Um vínculo de compatibilidade deve ligar um acessório a um produto principal.',
      )
    }
    if (!accessorySide.is_accessory && !productSide.is_accessory) {
      throw new Error(
        'Vínculo recusado: nenhum dos produtos está marcado como acessório. Um vínculo de compatibilidade deve partir de um acessório (marque o produto como acessório antes de vinculá-lo).',
      )
    }

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
